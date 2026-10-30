import type { CustomerPool, CustomerStatus } from "./labels";

export type CustomerQueryFilters = {
  pool: CustomerPool | "all";
  search?: string;
  countryIds?: string[];
  assignedCountry?: string;
  staff?: string;
  callRound?: "all" | "none" | "1" | "2" | "3";
  dateFromIso?: string | null;
  dateToIso?: string | null;
};

/** Shared scope for list and status distribution; status selection is separate. */
export function customerQueryFilters(p: CustomerQueryFilters) {
  return {
    _pool: p.pool === "all" ? undefined : p.pool,
    _search: p.search?.trim() || undefined,
    _country_ids: p.countryIds?.length ? p.countryIds : undefined,
    _assigned_to:
      !p.staff || p.staff === "all" ? undefined : p.staff === "__none__" ? "unassigned" : p.staff,
    _assigned_country:
      !p.assignedCountry || p.assignedCountry === "all"
        ? undefined
        : p.assignedCountry === "__none__"
          ? "none"
          : p.assignedCountry,
    _call_round:
      !p.callRound || p.callRound === "all"
        ? undefined
        : p.callRound === "none"
          ? 0
          : Number(p.callRound),
    _date_from: p.dateFromIso ?? undefined,
    _date_to: p.dateToIso ?? undefined,
  };
}

export function customerStatusCountsKey(p: CustomerQueryFilters) {
  return [
    "customers",
    "statusCounts",
    p.pool,
    p.search?.trim() ?? "",
    (p.countryIds ?? []).slice().sort().join(","),
    p.assignedCountry ?? "all",
    p.staff ?? "all",
    p.callRound ?? "all",
    p.dateFromIso ?? "",
    p.dateToIso ?? "",
  ] as const;
}

export function customerStatusFilter(status?: "all" | CustomerStatus | "__call_completed__") {
  return {
    _status: !status || status === "all" || status === "__call_completed__" ? undefined : status,
    _call_completed: status === "__call_completed__",
  };
}
