import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdminStaffActivityResponse, AdminStaffActivityUser } from "@/types/rpc";

export type Country = { id: string; code: string; name_ko: string };

export type SettingsRow = {
  id: string;
  display_name: string;
  department: string | null;
  is_active: boolean;
  role: "admin" | "staff";
  country_ids: string[];
  avatar_url: string | null;
  call_target: number;
  activation_target: number;
  email: string | null;
  last_sign_in_at: string | null;
  sort_order: number;
  can_access_new_signup: boolean;
};

export type SettingsBundle = {
  rows: SettingsRow[];
  countries: Country[];
};

export function useSettingsData(params: { year: number; month: number; isAdmin: boolean }) {
  const { year, month, isAdmin } = params;
  return useQuery<SettingsBundle>({
    queryKey: ["settings", year, month, isAdmin],
    queryFn: async () => {
      const [
        { data: profiles, error: profilesErr },
        { data: roles, error: rolesErr },
        { data: targets, error: targetsErr },
        { data: co, error: coErr },
        { data: pcs, error: pcsErr },
        activityRes,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, department, is_active, country_id, avatar_url, sort_order, can_access_new_signup")
          .order("sort_order")
          .order("display_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("targets").select("user_id, call_target, activation_target").eq("year", year).eq("month", month),
        supabase.from("countries").select("id, code, name_ko").order("code"),
        supabase.from("profile_countries").select("user_id, country_id"),
        isAdmin
          ? supabase.functions.invoke<AdminStaffActivityResponse>("admin-list-staff-activity")
          : Promise.resolve({ data: { users: [] as AdminStaffActivityUser[] }, error: null }),
      ]);
      if (profilesErr) throw profilesErr;
      if (rolesErr) throw rolesErr;
      if (targetsErr) throw targetsErr;
      if (coErr) throw coErr;
      if (pcsErr) throw pcsErr;

      const activityList: AdminStaffActivityUser[] = activityRes?.data?.users ?? [];

      const pcMap = new Map<string, string[]>();
      (pcs ?? []).forEach((p) => {
        const arr = pcMap.get(p.user_id) ?? [];
        arr.push(p.country_id);
        pcMap.set(p.user_id, arr);
      });

      const rows: SettingsRow[] = (profiles ?? []).map((p) => {
        const r = roles?.find((x) => x.user_id === p.id);
        const tg = targets?.find((x) => x.user_id === p.id);
        const a = activityList.find((x) => x.id === p.id);
        return {
          id: p.id,
          display_name: p.display_name,
          department: p.department,
          is_active: p.is_active,
          role: (r?.role as "admin" | "staff") ?? "staff",
          country_ids: pcMap.get(p.id) ?? [],
          avatar_url: p.avatar_url ?? null,
          call_target: tg?.call_target ?? 0,
          activation_target: tg?.activation_target ?? 0,
          email: a?.email ?? null,
          last_sign_in_at: a?.last_sign_in_at ?? null,
          sort_order: p.sort_order ?? 1000,
          can_access_new_signup: !!p.can_access_new_signup,
        };
      });
      rows.sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name));

      return { rows, countries: (co ?? []) as Country[] };
    },
  });
}
