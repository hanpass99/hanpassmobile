import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { POOLS, type CustomerPool, type CustomerStatus } from "@/lib/labels";
import type { CustomerPoolCountRow } from "@/types/rpc";

/** Debounce a value. Default 250ms — used for customer search input. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debounced;
}

// === Types ===
export type Country = { id: string; code: string; name_ko: string };
export type Channel = { id: string; name: string };
export type Profile = { id: string; display_name: string; country_id: string | null };

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  country_id: string | null;
  channel_id: string | null;
  assigned_to: string | null;
  status: CustomerStatus;
  pool: CustomerPool;
  signup_date: string;
  imported_at: string;
  notes: string | null;
  activation_date: string | null;
  carrier_plan: string | null;
  charge_phone: string | null;
  charge_amount: number | null;
  charge_date: string | null;
  application_date: string | null;
  requested_plan: string | null;
  call_round: number | null;
};

export type CustomersSearchParams = {
  pool: CustomerPool | "all";
  search?: string;
  countryIds?: string[]; // [] = all
  assignedCountry?: string; // "all" | "__none__" | id
  status?: "all" | CustomerStatus | "__call_completed__";
  staff?: string; // "all" | "__none__" | id
  callRound?: "all" | "none" | "1" | "2" | "3";
  sortKey: string;
  sortDir: "asc" | "desc" | null;
  page: number;
  pageSize: number;
  dateFromIso?: string | null;
  dateToIso?: string | null;
};

const SERVER_SORT_KEYS = new Set([
  "name", "phone", "status", "imported_at", "activation_date",
  "application_date", "carrier_plan", "requested_plan",
]);

// === Lookups (countries / channels / staff) ===
export function useCustomersLookups() {
  const q = useQuery({
    queryKey: ["customers", "lookups"],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const [co, ch, sf] = await Promise.all([
        supabase.from("countries").select("id, code, name_ko").eq("is_active", true).order("code"),
        supabase.from("channels").select("id, name").eq("is_active", true).order("name"),
        supabase.from("profiles").select("id, display_name, country_id").eq("is_active", true).order("sort_order").order("display_name"),
      ]);
      return {
        countries: (co.data ?? []) as Country[],
        channels: (ch.data ?? []) as Channel[],
        staff: (sf.data ?? []) as Profile[],
      };
    },
  });
  return {
    countries: q.data?.countries ?? [],
    channels: q.data?.channels ?? [],
    staff: q.data?.staff ?? [],
    isLoading: q.isLoading,
    error: q.error,
  };
}

// === Pool counts (tab badges) ===
export function useCustomerPoolCounts() {
  const q = useQuery({
    queryKey: ["customers", "poolCounts"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_pool_counts");
      if (!error) {
        const out: Record<string, number> = {};
        ((data ?? []) as CustomerPoolCountRow[]).forEach((r) => {
          out[r.pool] = Number(r.cnt ?? 0);
        });
        return out;
      }
      const fallback: Record<string, number> = {};
      await Promise.all(POOLS.map(async (p) => {
        const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("pool", p);
        fallback[p] = count ?? 0;
      }));
      return fallback;
    },
  });
  return { counts: q.data ?? {}, refetch: q.refetch, isLoading: q.isLoading };
}

// === Status counts (per tab cards) ===
export type StatusCountsParams = {
  pool: CustomerPool | "all";
  country?: string; // "all" | id
  dateFromIso?: string | null;
  dateToIso?: string | null;
};

export function useCustomerStatusCounts(p: StatusCountsParams) {
  const q = useQuery({
    queryKey: [
      "customers", "statusCounts",
      p.pool, p.country ?? "all", p.dateFromIso ?? "", p.dateToIso ?? "",
    ] as const,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<{ counts: Record<string, number>; total: number }> => {
      const { data, error } = await supabase.rpc("stats_status_counts", {
        _pool: p.pool === "all" ? undefined : p.pool,
        _country_id: !p.country || p.country === "all" ? undefined : p.country,
        _date_from: p.dateFromIso ?? undefined,
        _date_to: p.dateToIso ?? undefined,
      });
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      let total = 0;
      ((data ?? []) as Array<{ status: string; cnt: number }>).forEach((r) => {
        const n = Number(r.cnt ?? 0);
        counts[r.status] = n;
        total += n;
      });
      return { counts, total };
    },
  });
  return {
    counts: q.data?.counts ?? {},
    total: q.data?.total ?? 0,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
}

// === Search / list (search_customers RPC) ===
export type CustomersListResult = { rows: CustomerRow[]; total: number };

export function customersListQueryKey(p: CustomersSearchParams) {
  return [
    "customers", "list",
    p.pool, p.search ?? "", p.country ?? "all",
    p.assignedCountry ?? "all", p.status ?? "all", p.staff ?? "all",
    p.callRound ?? "all", p.sortKey, p.sortDir,
    p.page, p.pageSize, p.dateFromIso ?? "", p.dateToIso ?? "",
  ] as const;
}

export function useCustomersList(p: CustomersSearchParams, options?: { enabled?: boolean }) {
  const q = useQuery({
    queryKey: customersListQueryKey(p),
    enabled: options?.enabled ?? true,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<CustomersListResult> => {
      const sortKeyForRpc = SERVER_SORT_KEYS.has(p.sortKey) ? p.sortKey : "imported_at";
      const sortDirForRpc = p.sortDir ?? "desc";
      const { data, error } = await supabase.rpc("search_customers", {
        _pool: p.pool === "all" ? undefined : p.pool,
        _search: p.search?.trim() || undefined,
        _country_id: !p.country || p.country === "all" ? undefined : p.country,
        _assigned_to: !p.staff || p.staff === "all" ? undefined : (p.staff === "__none__" ? "unassigned" : p.staff),
        _assigned_country: !p.assignedCountry || p.assignedCountry === "all" ? undefined : (p.assignedCountry === "__none__" ? "none" : p.assignedCountry),
        _status: (!p.status || p.status === "all" || p.status === "__call_completed__") ? undefined : p.status,
        _date_from: p.dateFromIso ?? undefined,
        _date_to: p.dateToIso ?? undefined,
        _sort_key: sortKeyForRpc,
        _sort_dir: sortDirForRpc,
        _page: p.page,
        _page_size: p.pageSize,
        _call_round: (p.callRound === "all" || !p.callRound ? undefined : (p.callRound === "none" ? null : Number(p.callRound))) as number | undefined,
        _call_completed: p.status === "__call_completed__",
      });
      if (error) throw new Error(error.message);
      const fetched = ((data ?? []) as Array<{ data: CustomerRow; total_count: number }>);
      return {
        rows: fetched.map((r) => r.data),
        total: fetched[0]?.total_count ?? 0,
      };
    },
  });
  return {
    rows: q.data?.rows ?? [],
    total: q.data?.total ?? 0,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  };
}

// === Cache helpers for optimistic / realtime updates ===
export function useCustomersCache() {
  const qc = useQueryClient();
  return {
    /** Apply a patch to every cached customers list. */
    patchRow(id: string, patch: Partial<CustomerRow>) {
      qc.setQueriesData<CustomersListResult>({ queryKey: ["customers", "list"] }, (old) => {
        if (!old) return old;
        return { ...old, rows: old.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
      });
    },
    /** Remove a row from every cached customers list. */
    removeRow(id: string) {
      qc.setQueriesData<CustomersListResult>({ queryKey: ["customers", "list"] }, (old) => {
        if (!old) return old;
        if (!old.rows.some((r) => r.id === id)) return old;
        return { rows: old.rows.filter((r) => r.id !== id), total: Math.max(0, old.total - 1) };
      });
    },
    invalidateList() {
      qc.invalidateQueries({ queryKey: ["customers", "list"] });
    },
    invalidatePoolCounts() {
      qc.invalidateQueries({ queryKey: ["customers", "poolCounts"] });
    },
  };
}
