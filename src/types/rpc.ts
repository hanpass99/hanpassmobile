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
