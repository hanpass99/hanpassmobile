import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { dayEndIso, dayStartIso } from "@/lib/date-range";
import i18n from "@/i18n";

const DAILY_GOAL = 50;
const STEP = 10;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Notifies staff every 10 calls until they reach 50/day. Admin is excluded from the alerts. */
export function useCallGoal() {
  const { user, isAdmin } = useAuth();
  const lastNotifiedRef = useRef<number>(0);

  useEffect(() => {
    if (!user || isAdmin) return;
    let active = true;
    const controller = new AbortController();

    const storageKey = `callGoalNotified:${user.id}:${todayKey()}`;
    lastNotifiedRef.current = Number(sessionStorage.getItem(storageKey) || "0");

    const fireIfNeeded = (count: number) => {
      if (count >= DAILY_GOAL) {
        if (lastNotifiedRef.current < DAILY_GOAL) {
          toast.success(i18n.t("goal.achieved"));
          lastNotifiedRef.current = DAILY_GOAL;
          sessionStorage.setItem(storageKey, String(DAILY_GOAL));
        }
        return;
      }
      const milestone = Math.floor(count / STEP) * STEP;
      if (milestone > 0 && milestone > lastNotifiedRef.current) {
        toast(i18n.t("goal.progress", { count: milestone }), {
          description: i18n.t("goal.remaining", { n: DAILY_GOAL - count }),
        });
        lastNotifiedRef.current = milestone;
        sessionStorage.setItem(storageKey, String(milestone));
      }
    };

    const fetchCount = async (signal: AbortSignal) => {
      const today = new Date();
      const { count } = await supabase
        .from("customer_call_rounds")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", user.id)
        .gte("call_date", dayStartIso(today).slice(0, 10))
        .lte("call_date", dayEndIso(today).slice(0, 10));
      if (active && !signal.aborted) fireIfNeeded(count ?? 0);
    };

    fetchCount(controller.signal);

    const channel = supabase
      .channel(`call-goal-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_call_rounds", filter: `staff_id=eq.${user.id}` },
        () => fetchCount(controller.signal),
      )
      .subscribe();

    return () => {
      active = false;
      controller.abort();
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin]);
}
