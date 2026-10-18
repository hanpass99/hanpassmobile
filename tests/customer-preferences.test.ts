import { expect, test } from "bun:test";
import {
  CUSTOMER_PAGE_SIZES,
  customerPreferencesKey,
  readCustomerPreferences,
  rowNavigationIndex,
} from "../src/lib/customer-preferences";

test("page size options are exactly 20, 50, 100", () => {
  expect(CUSTOMER_PAGE_SIZES).toEqual([20, 50, 100]);
  expect(readCustomerPreferences('{"pageSize":25}')?.pageSize).toBe(20);
  expect(readCustomerPreferences('{"pageSize":100}')?.pageSize).toBe(100);
});
test("preferences are isolated by user", () => {
  expect(customerPreferencesKey("staff-a")).toBe("customers.preferences.staff-a");
  expect(customerPreferencesKey("staff-b")).not.toBe(customerPreferencesKey("staff-a"));
});
test("all filters and tab round-trip", () => {
  const preferences = {
    tab: "loan_borrower",
    search: "Sample",
    countryIds: ["country-1"],
    assignedCountry: "country-2",
    status: "callback",
    staff: "staff-a",
    callRound: "2",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-18",
    pageSize: 50,
  };
  expect(readCustomerPreferences(JSON.stringify(preferences))).toEqual(preferences);
  expect(readCustomerPreferences("broken")).toBeNull();
});
test("arrow navigation stays within visible rows", () => {
  expect(rowNavigationIndex("ArrowDown", 0, 3)).toBe(1);
  expect(rowNavigationIndex("ArrowUp", 0, 3)).toBe(0);
  expect(rowNavigationIndex("ArrowDown", 2, 3)).toBe(2);
  expect(rowNavigationIndex("ArrowDown", 0, 0)).toBeNull();
  expect(rowNavigationIndex("s", 0, 3)).toBeNull();
});
