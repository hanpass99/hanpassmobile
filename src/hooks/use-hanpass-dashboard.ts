import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dayEndIso, dayStartIso } from "@/lib/date-range";
import type { HanpassDashboard } from "@/types/rpc";

export const HANPASS_POOLS = [
  "activation_request",
  "qr_activation",
  "friend_referral",
  "prepaid_charge",
] as const;

export function useHanpassCountries() {
  return useQuery({
    queryKey: ["hanpass-dash", "countries"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("id, code, name_ko")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return (data ?? []) as { id: string; code: string; name_ko: string }[];
    },
  });
}

export function useHanpassStaff() {
  return useQuery({
    queryKey: ["hanpass-dash", "staff"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, is_active")
        .eq("company", "한패스")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as { id: string; display_name: string; is_active: boolean }[];
    },
  });
}

export function useHanpassDashboard(params: {
  from: Date;
  to: Date;
  countryIds: string[];
  staffIds: string[];
  pools: string[];
  enabled?: boolean;
}) {
  const { from, to, countryIds, staffIds, pools, enabled = true } = params;
  const fromIso = dayStartIso(from);
  const toIso = dayEndIso(to);
  const countryKey = [...countryIds].sort().join(",");
  const staffKey = [...staffIds].sort().join(",");
  const poolKey = [...pools].sort().join(",");

  return useQuery({
    queryKey: ["hanpass-dash", "summary", fromIso, toIso, countryKey, staffKey, poolKey],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HanpassDashboard> => {
      const { data, error } = await supabase.rpc("stats_hanpass_dashboard", {
        _date_from: fromIso,
        _date_to: toIso,
        ...(countryIds.length ? { _country_ids: countryIds } : {}),
        ...(staffIds.length ? { _staff_ids: staffIds } : {}),
        ...(pools.length ? { _pools: pools } : {}),
      });
      if (error) throw error;
      return (data ?? {}) as unknown as HanpassDashboard;
    },
  });
}
