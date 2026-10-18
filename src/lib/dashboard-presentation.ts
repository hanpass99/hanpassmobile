import {
  differenceInCalendarDays,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type {
  DashboardSummary,
  DashboardCountryActivated,
  DashboardStaffRanking,
} from "@/types/rpc";

export function previousDashboardPeriod(from: Date, to: Date) {
  const days = Math.max(1, differenceInCalendarDays(to, from) + 1);
  return { from: subDays(startOfDay(from), days), to: subDays(startOfDay(from), 1) };
}

export type DashboardPreset = "thisMonth" | "lastMonth" | "last7Days" | "today";

export function dashboardDatePreset(preset: DashboardPreset, now = new Date()) {
  const today = startOfDay(now);
  switch (preset) {
    case "thisMonth":
      return { from: startOfMonth(today), to: today };
    case "lastMonth": {
      const month = subMonths(today, 1);
      return { from: startOfMonth(month), to: startOfDay(endOfMonth(month)) };
    }
    case "last7Days":
      return { from: subDays(today, 6), to: today };
    case "today":
      return { from: today, to: today };
  }
}

// One business definition for dashboard KPIs, including previous-period comparisons.
// The legacy RPC call_completed counts call rounds, not customer statuses.
export function dashboardMetrics(summary: DashboardSummary = {}) {
  const statusCounts = summary.status_counts ?? {};
  const callCompleted = Object.entries(statusCounts).reduce(
    (sum, [status, count]) => (status === "new" ? sum : sum + Number(count || 0)),
    0,
  );
  const activated = Number(statusCounts.activated ?? 0);
  return {
    notStarted: Number(statusCounts.new ?? 0),
    callCompleted,
    activated,
    activationSuccessRate: callCompleted ? (activated / callCompleted) * 100 : 0,
  };
}

export function dashboardDelta(current: number, previous: number, decreaseIsGood = false) {
  if (previous === 0) return null;
  const percent = ((current - previous) / previous) * 100;
  return { percent, good: percent === 0 ? null : decreaseIsGood ? percent < 0 : percent > 0 };
}

export function dashboardCountryBars(rows: DashboardCountryActivated[], othersLabel: string) {
  const sorted = rows
    .map((row) => ({ name: row.code, value: Number(row.activated) }))
    .sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 8);
  if (sorted.length > 8)
    top.push({
      name: othersLabel,
      value: sorted.slice(8).reduce((sum, row) => sum + row.value, 0),
    });
  return top;
}

export function dashboardRanking(rows: DashboardStaffRanking[], search: string, showAll: boolean) {
  const query = search.trim().toLocaleLowerCase();
  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  const matches = query
    ? ranked.filter((row) => row.display_name.toLocaleLowerCase().includes(query))
    : ranked;
  return showAll || query ? matches : matches.slice(0, 10);
}
