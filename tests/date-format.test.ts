import { describe, expect, test } from "bun:test";
import { formatDate, formatDateTime } from "../src/lib/date-format";

describe("date display format", () => {
  test("dates show as yyyy-mm-dd", () => {
    expect(formatDate(new Date(2026, 9, 3))).toBe("2026-10-03");
  });
  test("date-times show as yyyy-mm-dd HH:mm", () => {
    expect(formatDateTime(new Date(2026, 9, 3, 7, 5))).toBe("2026-10-03 07:05");
  });
  test("missing or invalid dates show the fallback", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDateTime("not-a-date", "—")).toBe("—");
  });
});
