import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SlaViolationRow = {
  customer_id: string;
  customer_name: string;
  phone: string;
  country_id: string | null;
  country_code: string | null;
  status: "new" | "in_progress" | "no_answer";
  since: string;
  deadline: string;
  overdue_hours: number;
  overdue_days: number;
  daily_fine: number;
  fine_total: number;
  assigned_to: string | null;
};

export type SlaTeamRow = {
  country_id: string;
  country_code: string;
  country_name: string;
  violations_new: number;
  violations_in_progress: number;
  violations_absent: number;
  violations_total: number;
  gross_fine: number;
  adjustments: number;
  net_fine: number;
};

export type SlaAdjustmentRow = {
  id: string;
  country_id: string | null;
  period_start: string;
  period_end: string;
  adjustment_type: "reset" | "override" | "waive";
  amount: number;
  reason: string | null;
  admin_id: string | null;
  created_at: string;
};

export function useSlaViolations(countryIds?: string[]) {
  const idsKey = (countryIds ?? []).slice().sort().join(",");
  return useQuery({
    queryKey: ["sla", "violations", idsKey],
    staleTime: 15_000,
    queryFn: async (): Promise<SlaViolationRow[]> => {
      const { data, error } = await supabase.rpc("sla_violations", {
        _country_ids: countryIds && countryIds.length ? countryIds : undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as SlaViolationRow[];
    },
  });
}

export function useSlaTeamSummary(periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ["sla", "team", periodStart, periodEnd],
    staleTime: 15_000,
    queryFn: async (): Promise<SlaTeamRow[]> => {
      const { data, error } = await supabase.rpc("sla_team_summary", {
        _period_start: periodStart,
        _period_end: periodEnd,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as SlaTeamRow[];
    },
  });
}

export function useSlaViolationCount() {
  return useQuery({
    queryKey: ["sla", "count"],
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("sla_violations_count");
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
  });
}

export function useSlaAdjustments(limit = 50) {
  return useQuery({
    queryKey: ["sla", "adjustments", limit],
    staleTime: 15_000,
    queryFn: async (): Promise<SlaAdjustmentRow[]> => {
      const { data, error } = await supabase
        .from("sla_fine_adjustments")
        .select("id, country_id, period_start, period_end, adjustment_type, amount, reason, admin_id, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as SlaAdjustmentRow[];
    },
  });
}

/** Realtime subscription: invalidate SLA queries when customers or adjustments change. */
export function useSlaRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("sla-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => {
        qc.invalidateQueries({ queryKey: ["sla"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sla_fine_adjustments" }, () => {
        qc.invalidateQueries({ queryKey: ["sla"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

export function useSlaAdminActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["sla"] });

  const reset = useMutation({
    mutationFn: async (v: { countryId: string; periodStart: string; periodEnd: string; reason?: string }) => {
      const { error } = await supabase.rpc("admin_sla_reset_fine", {
        _country_id: v.countryId,
        _period_start: v.periodStart,
        _period_end: v.periodEnd,
        _reason: v.reason ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const override = useMutation({
    mutationFn: async (v: { countryId: string; periodStart: string; periodEnd: string; amount: number; reason?: string }) => {
      const { error } = await supabase.rpc("admin_sla_override_fine", {
        _country_id: v.countryId,
        _period_start: v.periodStart,
        _period_end: v.periodEnd,
        _amount: v.amount,
        _reason: v.reason ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const waive = useMutation({
    mutationFn: async (v: { countryId: string; periodStart: string; periodEnd: string; amount: number; reason?: string }) => {
      const { error } = await supabase.rpc("admin_sla_waive_fine", {
        _country_id: v.countryId,
        _period_start: v.periodStart,
        _period_end: v.periodEnd,
        _amount: v.amount,
        _reason: v.reason ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { reset, override, waive };
}

/** ISO date helpers (KST-aware; app uses KST for daily boundaries). */
export function todayKstIso(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + 9 * 3_600_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

export function weekStartKstIso(): string {
  const t = todayKstIso();
  const d = new Date(`${t}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow; // Monday as start
  d.setUTCDate(d.getUTCDate() + diff);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function monthStartKstIso(): string {
  const t = todayKstIso();
  return `${t.slice(0, 8)}01`;
}
