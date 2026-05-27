import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dateKey, dayEndIso, dayStartIso } from "@/lib/date-range";
import type {
  StaffStatsRow, StaffRankingRow, ProfileSortRow, StaffAttendanceRow,
} from "@/types/rpc";

export type StaffPerfBundle = {
  staffStats: StaffStatsRow[];
  ranking: StaffRankingRow[];
  profiles: ProfileSortRow[];
  attendance: StaffAttendanceRow[];
  callCompleted: Record<string, number>;
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
      const [staffRes, rankingRes, profilesRes, attRes, callCompletedRes] = await Promise.all([
        supabase.rpc("stats_by_staff", { _date_from: fromIso, _date_to: toIso }),
        supabase.rpc("stats_staff_ranking", {
          _date_from: fromIso,
          _date_to: toIso,
          _year: year,
          _month: month,
        }),
        supabase.from("profiles").select("id, sort_order"),
        supabase.from("staff_attendance").select("user_id, status").eq("attendance_date", attendanceKey),
        supabase.rpc("stats_staff_call_completed", { _date_from: fromIso, _date_to: toIso }),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (rankingRes.error) throw rankingRes.error;
      const callCompleted: Record<string, number> = {};
      for (const r of (callCompletedRes.data ?? []) as Array<{ user_id: string; call_completed: number }>) {
        callCompleted[r.user_id] = Number(r.call_completed ?? 0);
      }
      return {
        staffStats: (staffRes.data ?? []) as unknown as StaffStatsRow[],
        ranking: (rankingRes.data ?? []) as unknown as StaffRankingRow[],
        profiles: (profilesRes.data ?? []) as ProfileSortRow[],
        attendance: (attRes.data ?? []) as StaffAttendanceRow[],
        callCompleted,
      };
    },
  });
}

