// Shared interfaces for RPC return shapes that Supabase types either
// return as raw `Json` or that we want narrowed for client use.

export type DashboardStatusCounts = Record<string, number>;

export interface DashboardTotals {
  total_calls?: number;
  total_customers?: number;
  monthly_target_total?: number;
}

export interface DashboardDailyCall {
  day: string;
  calls: number;
  activations: number;
}

export interface DashboardCountryActivated {
  code: string;
  activated: number;
}

export interface DashboardChannelSummary {
  name: string;
  customers: number;
  activations: number;
}

export interface DashboardStaffRanking {
  user_id: string;
  display_name: string;
  total_calls: number;
  activated: number;
  activation_target?: number;
}

export interface DashboardSummary {
  status_counts?: DashboardStatusCounts;
  totals?: DashboardTotals;
  daily_calls?: DashboardDailyCall[];
  country_activated?: DashboardCountryActivated[];
  channel_summary?: DashboardChannelSummary[];
  staff_ranking?: DashboardStaffRanking[];
  call_completed?: number;
}

export interface StaffStatsRow {
  user_id: string;
  display_name: string;
  total: number;
  status_counts: Record<string, number>;
}

export interface StaffRankingRow {
  user_id: string;
  display_name: string;
  total_calls: number;
  activated: number;
  activation_target: number;
  attendance: string;
}

export interface ProfileSortRow {
  id: string;
  sort_order: number | null;
}

export interface StaffAttendanceRow {
  user_id: string;
  status: string;
}

export interface CustomerPoolCountRow {
  pool: string;
  cnt: number | string;
}

// ---- 한패스 소속 전용 대시보드 ----

export interface HanpassTotals {
  handled?: number;
  customers?: number;
  activated?: number;
  staff?: number;
}

export interface HanpassTeamRow {
  country_id: string | null;
  code: string;
  staff: number;
  handled: number;
  activated: number;
  status_counts: Record<string, number>;
}

export interface HanpassStaffRow {
  staff_id: string;
  name: string;
  teams: string[];
  handled: number;
  activated: number;
  customers: number;
  active_days: number;
  last_at: string | null;
  status_counts: Record<string, number>;
}

export interface HanpassDailyRow {
  day: string;
  handled: number;
  activated: number;
}

export interface HanpassHeatRow {
  staff_id: string;
  day: string;
  cnt: number;
}

export interface HanpassRecentRow {
  at: string;
  staff: string;
  customer: string;
  phone: string | null;
  code: string | null;
  pool: string;
  status: string;
}

export interface HanpassDashboard {
  totals?: HanpassTotals;
  prev_totals?: HanpassTotals;
  by_team?: HanpassTeamRow[];
  by_staff?: HanpassStaffRow[];
  daily?: HanpassDailyRow[];
  status_counts?: Record<string, number>;
  heatmap?: HanpassHeatRow[];
  recent?: HanpassRecentRow[];
}

// ---- Edge function payloads ----


export interface AdminStaffActivityUser {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
}

export interface AdminStaffActivityResponse {
  users: AdminStaffActivityUser[];
}

export interface AdminResetPasswordResponse {
  temp_password?: string;
  error?: string;
}

export interface AdminDeleteStaffResponse {
  error?: string;
}

export interface AdminCreateStaffResponse {
  error?: string;
}

