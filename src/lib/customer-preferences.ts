export const CUSTOMER_PAGE_SIZES = [20, 50, 100] as const;
export type CustomerPageSize = (typeof CUSTOMER_PAGE_SIZES)[number];

export type CustomerPreferences = {
  tab: string;
  search: string;
  countryIds: string[];
  assignedCountry: string;
  status: string;
  staff: string;
  callRound: string;
  dateFrom?: string;
  dateTo?: string;
  pageSize: CustomerPageSize;
};

export function customerPreferencesKey(userId: string) {
  return `customers.preferences.${userId}`;
}

export function readCustomerPreferences(raw: string | null): CustomerPreferences | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const text = (key: string, fallback: string) =>
      typeof value[key] === "string" ? value[key] : fallback;
    const date = (key: string) => {
      const result = text(key, "");
      return /^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(Date.parse(result))
        ? result
        : undefined;
    };
    return {
      tab: text("tab", "existing"),
      search: text("search", ""),
      countryIds: Array.isArray(value.countryIds)
        ? value.countryIds.filter((id: unknown): id is string => typeof id === "string")
        : [],
      assignedCountry: text("assignedCountry", "all"),
      status: text("status", "all"),
      staff: text("staff", "all"),
      callRound: text("callRound", "all"),
      dateFrom: date("dateFrom"),
      dateTo: date("dateTo"),
      pageSize: CUSTOMER_PAGE_SIZES.includes(value.pageSize) ? value.pageSize : 20,
    };
  } catch {
    return null;
  }
}

export function rowNavigationIndex(key: string, current: number, count: number) {
  if (count === 0 || (key !== "ArrowDown" && key !== "ArrowUp")) return null;
  return Math.max(0, Math.min(count - 1, current + (key === "ArrowDown" ? 1 : -1)));
}
