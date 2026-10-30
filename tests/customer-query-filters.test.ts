import { expect, test } from "bun:test";
import { customerQueryFilters, customerStatusCountsKey, customerStatusFilter } from "../src/lib/customer-query-filters";

test("PH assigned-country scope is passed separately from customer nationality", () => {
  const filters = customerQueryFilters({ pool: "activation_request", countryIds: [], assignedCountry: "ph-country-id" });
  expect(filters._assigned_country).toBe("ph-country-id");
  expect(filters._country_ids).toBeUndefined();
  expect(customerQueryFilters({ pool: "activation_request", countryIds: ["ph-country-id"] })._country_ids).toEqual(["ph-country-id"]);
});

test("counts and list share search, staff, dates and no-round sentinels", () => {
  expect(customerQueryFilters({ pool: "one_year_activation", search: " Test ", staff: "__none__", assignedCountry: "__none__", callRound: "none", dateFromIso: "2026-10-01", dateToIso: "2026-10-30" })).toEqual({
    _pool: "one_year_activation", _search: "Test", _country_ids: undefined,
    _assigned_to: "unassigned", _assigned_country: "none", _call_round: 0,
    _date_from: "2026-10-01", _date_to: "2026-10-30",
  });
});

test("each list scope change invalidates the status distribution key", () => {
  const base = { pool: "activation_request" as const };
  for (const change of [{ search: "A" }, { countryIds: ["PH"] }, { assignedCountry: "PH" }, { staff: "staff-1" }, { callRound: "2" as const }, { dateFromIso: "2026-10-01" }, { dateToIso: "2026-10-30" }]) {
    expect(customerStatusCountsKey({ ...base, ...change })).not.toEqual(customerStatusCountsKey(base));
  }
});

test("status selection narrows only the list and never the status-card distribution", () => {
  expect(customerStatusFilter("new")).toEqual({ _status: "new", _call_completed: false });
  expect(customerStatusFilter("__call_completed__")).toEqual({ _status: undefined, _call_completed: true });
  expect(customerQueryFilters({ pool: "activation_request" })).not.toHaveProperty("_status");
});