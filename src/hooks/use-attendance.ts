import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dateKey as formatDateKey, dayEndIso, dayStartIso } from "@/lib/date-range";
import type { StaffRankingRow, StaffAttendanceRow } from "@/types/rpc";
import type { AttendanceStatus } from "@/lib/labels";

export type AttendanceHistoryRow = {
  id: string;
  user_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  note: string | null;
  set_by: string | null;
  updated_at: string;
};

export type AttendanceBundle = {
  ranking: StaffRankingRow[];
  attendance: StaffAttendanceRow[];
  history: AttendanceHistoryRow[];
};

export function useAttendance(date: Date) {
  const fromIso = dayStartIso(date);
  const toIso = dayEndIso(date);
  const dKey = formatDateKey(date);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  return useQuery<AttendanceBundle>({
    queryKey: ["attendance", dKey],
    queryFn: async () => {
      const [rankingRes, attRes, histRes] = await Promise.all([
        supabase.rpc("stats_staff_ranking", {
          _date_from: fromIso,
          _date_to: toIso,
          _year: year,
          _month: month,
        }),
        supabase.from("staff_attendance").select("user_id, status").eq("attendance_date", dKey),
        supabase
          .from("staff_attendance")
          .select("id, user_id, attendance_date, status, note, set_by, updated_at")
          .order("attendance_date", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(300),
      ]);
      if (rankingRes.error) throw rankingRes.error;
      if (attRes.error) throw attRes.error;
      if (histRes.error) throw histRes.error;
      return {
        ranking: (rankingRes.data ?? []) as unknown as StaffRankingRow[],
        attendance: (attRes.data ?? []) as StaffAttendanceRow[],
        history: (histRes.data ?? []) as unknown as AttendanceHistoryRow[],
      };
    },
  });
}
