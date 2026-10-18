import { localizeError } from "@/i18n/localize-error";
import { uiCopy } from "@/i18n/ui-copy";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Sun } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { dateKey } from "@/lib/date-range";

/**
 * Blocks the app for staff users until they click "출근 완료" for today.
 * If they never click, no attendance row exists → SLA logic treats today as absent (exempt).
 */
export function AttendanceCheckInGate({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isHanpass, loading } = useAuth();
  const { t, i18n } = useTranslation();
  const [checked, setChecked] = useState(false);
  const [present, setPresent] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = dateKey(new Date());

  useEffect(() => {
    if (loading || !user) return;
    // Admins bypass the check-in gate.
    if (isAdmin || isHanpass) {
      setChecked(true);
      setPresent(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("staff_attendance")
        .select("status")
        .eq("user_id", user.id)
        .eq("attendance_date", today)
        .maybeSingle();
      if (cancelled) return;
      setPresent(!!data && data.status === "present");
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, isHanpass, loading, today]);

  const handleCheckIn = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("staff_attendance")
      .upsert(
        { user_id: user.id, attendance_date: today, status: "present", set_by: user.id },
        { onConflict: "user_id,attendance_date" },
      );
    setSaving(false);
    if (error) {
      toast.error(localizeError(error.message));
      return;
    }
    toast.success(uiCopy("ux.copya19230634f"));
    setPresent(true);
  };

  if (!checked || present) return <>{children}</>;

  const isKo = i18n.language === "ko";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-2xl border border-border">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
          <Sun className="h-8 w-8" />
        </div>
        <h2 className="text-center text-xl font-bold text-foreground">
          {uiCopy("ux.copy77c83d8823")}
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed">
          {uiCopy("ux.copydccf36b376")}
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {uiCopy("ux.copyd2a99ada84")}
        </p>
        <Button
          onClick={handleCheckIn}
          disabled={saving}
          className="mt-6 w-full h-12 text-base font-semibold"
        >
          <CheckCircle2 className="mr-2 h-5 w-5" />
          {saving
            ? uiCopy("ux.copye6e1a2914f")
            : uiCopy("ux.copy950de9eee8")}
        </Button>
      </div>
    </div>
  );
}
