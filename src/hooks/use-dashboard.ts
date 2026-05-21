import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dayEndIso, dayStartIso } from "@/lib/date-range";
import type { DashboardSummary } from "@/types/rpc";

export type { DashboardSummary } from "@/types/rpc";

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
    queryFn: async (): Promise<DashboardSummary> => {
      const { data, error } = await supabase.rpc("stats_dashboard_summary", {
        _date_from: fromIso,
        _date_to: toIso,
        _year: year,
        _month: month,
        _country_id: countryId ?? undefined,
      });
      if (error) throw error;
      return (data ?? {}) as unknown as DashboardSummary;
    },
  });
}
