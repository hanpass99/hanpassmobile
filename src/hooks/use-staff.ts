import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dateKey, dayEndIso, dayStartIso } from "@/lib/date-range";

export type StaffPerfBundle = {
  staffStats: any[];
  ranking: any[];
  profiles: { id: string; sort_order: number | null }[];
  attendance: { user_id: string; status: string }[];
};

export function useStaffPerformance(params: { from: Date; to: Date; attendanceDate: Date }) {
  const { from, to, attendanceDate } = params;
  const fromIso = dayStartIso(from);
  const toIso = dayEndIso(to);
  const attendanceKey = dateKey(attendanceDate);
  const year = from.getFullYear();
  const month = from.getMonth() + 1;

  return useQuery<StaffPerfBundle>({
    queryKey: ["staff-perf", fromIso, toIso, year, month, attendanceKey],
    queryFn: async () => {
      const [staffRes, rankingRes, profilesRes, attRes] = await Promise.all([
        supabase.rpc("stats_by_staff", { _date_from: fromIso, _date_to: toIso }),
        (supabase as any).rpc("stats_staff_ranking", {
          _date_from: fromIso,
          _date_to: toIso,
          _year: year,
          _month: month,
          _country_id: null,
          _attendance_date: null,
        }),
        supabase.from("profiles").select("id, sort_order"),
        supabase.from("staff_attendance").select("user_id, status").eq("attendance_date", attendanceKey),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (rankingRes.error) throw rankingRes.error;
      return {
        staffStats: (staffRes.data ?? []) as any[],
        ranking: (rankingRes.data ?? []) as any[],
        profiles: (profilesRes.data ?? []) as any[],
        attendance: (attRes.data ?? []) as any[],
      };
    },
  });
}
