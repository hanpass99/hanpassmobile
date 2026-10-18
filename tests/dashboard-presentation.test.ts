import { describe, expect, test } from "bun:test";
import {
  dashboardCountryBars,
  dashboardDatePreset,
  dashboardDelta,
  dashboardMetrics,
  dashboardRanking,
  previousDashboardPeriod,
} from "../src/lib/dashboard-presentation";
import { dateKey } from "../src/lib/date-range";

describe("dashboard presentation rules", () => {
  test("Oct 1–18 compares with Sep 13–30", () => {
    const previous = previousDashboardPeriod(new Date(2026, 9, 1), new Date(2026, 9, 18));
    expect(dateKey(previous.from)).toBe("2026-09-13");
    expect(dateKey(previous.to)).toBe("2026-09-30");
  });
  test("inclusive single-day and leap-month comparisons", () => {
    expect(dateKey(previousDashboardPeriod(new Date(2026, 0, 1), new Date(2026, 0, 1)).from)).toBe(
      "2025-12-31",
    );
    const previous = previousDashboardPeriod(new Date(2024, 2, 1), new Date(2024, 2, 29));
    expect(dateKey(previous.from)).toBe("2024-02-01");
    expect(dateKey(previous.to)).toBe("2024-02-29");
  });
  test("calls completed includes every status except new, not RPC call rounds", () => {
    expect(
      dashboardMetrics({
        status_counts: { new: 90, activated: 8, rejected: 7, callback: 5, no_answer: 20 },
        call_completed: 999,
      }),
    ).toEqual({ notStarted: 90, callCompleted: 40, activated: 8, activationSuccessRate: 20 });
  });
  test("zero previous value has no percentage delta", () => {
    expect(dashboardDelta(10, 0)).toBeNull();
  });
  test("decreasing unprocessed is good", () => {
    expect(dashboardDelta(50, 100, true)).toEqual({ percent: -50, good: true });
  });
  test("increasing completed metrics is good", () => {
    expect(dashboardDelta(150, 100)).toEqual({ percent: 50, good: true });
  });
  test("unchanged and declining completed metrics", () => {
    expect(dashboardDelta(100, 100)?.good).toBeNull();
    expect(dashboardDelta(50, 100)?.good).toBe(false);
  });
  test("country bars contain sorted top 8 plus all remaining values", () => {
    const bars = dashboardCountryBars(
      Array.from({ length: 10 }, (_, i) => ({ code: `C${i}`, activated: i + 1 })),
      "Others",
    );
    expect(bars.map((row) => row.value)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 3]);
    expect(bars[8]?.name).toBe("Others");
    expect(bars.reduce((sum, row) => sum + row.value, 0)).toBe(55);
  });
  test("top 10 default, show all and search retain original ranks", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      user_id: String(i),
      display_name: `Staff ${i + 1}`,
      total_calls: 12 - i,
      activated: 12 - i,
    }));
    expect(dashboardRanking(rows, "", false)).toHaveLength(10);
    expect(dashboardRanking(rows, "", true)).toHaveLength(12);
    expect(dashboardRanking(rows, "staff 12", false).map((row) => row.rank)).toEqual([12]);
  });
  test.each([
    ["thisMonth", "2026-10-01", "2026-10-18"],
    ["lastMonth", "2026-09-01", "2026-09-30"],
    ["last7Days", "2026-10-12", "2026-10-18"],
    ["today", "2026-10-18", "2026-10-18"],
  ] as const)("%s preset sets inclusive dates", (preset, from, to) => {
    const range = dashboardDatePreset(preset, new Date(2026, 9, 18));
    expect(dateKey(range.from)).toBe(from);
    expect(dateKey(range.to)).toBe(to);
  });
});
