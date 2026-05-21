import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dayEndIso, dayStartIso } from "@/lib/date-range";

export function useDashboardCountries() {
  return useQuery({
    queryKey: ["dashboard", "countries"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("id, code")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as { id: string; code: string }[];
    },
  });
}

export type DashboardSummary = {
  status_counts?: Record<string, number>;
  totals?: { total_calls?: number; total_customers?: number; monthly_target_total?: number };
  daily_calls?: { day: string; calls: number; activations: number }[];
  country_activated?: { code: string; activated: number }[];
  channel_summary?: { name: string; customers: number; activations: number }[];
  staff_ranking?: {
    user_id: string; display_name: string;
    total_calls: number; activated: number; activation_target?: number;
  }[];
  call_completed?: number;
};

export function useDashboardSummary(params: {
  from: Date; to: Date; countryId: string | null;
}) {
  const { from, to, countryId } = params;
  const fromIso = dayStartIso(from);
  const toIso = dayEndIso(to);
  const year = from.getFullYear();
  const month = from.getMonth() + 1;

  return useQuery({
    queryKey: ["dashboard", "summary", fromIso, toIso, year, month, countryId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("stats_dashboard_summary", {
        _date_from: fromIso,
        _date_to: toIso,
        _year: year,
        _month: month,
        _country_id: countryId,
        _pool: null,
      });
      if (error) throw error;
      return (data ?? {}) as DashboardSummary;
    },
  });
}
