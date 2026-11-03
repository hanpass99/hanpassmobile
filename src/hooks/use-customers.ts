import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { POOLS, type CustomerPool, type CustomerStatus } from "@/lib/labels";
import type { CustomerPoolCountRow } from "@/types/rpc";
import {
  customerQueryFilters,
  customerStatusCountsKey,
  customerStatusFilter,
  type CustomerQueryFilters,
} from "@/lib/customer-query-filters";
import {
  filterSourceRows,
  sortSourceRows,
  sourceMark,
  type CustomerSource,
} from "@/lib/customer-source";

/** 유입 필터 전용: RLS 그대로 customers 를 직접 조회 (DB 변경 없음). */
async function fetchSourceDataset(source: Exclude<CustomerSource, "all">, needCallRounds: boolean, p: { dateFromIso?: string | null; dateToIso?: string | null }) {
  const rows: CustomerRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("pool", "activation_request")
      .ilike("notes", `%${sourceMark(source)}%`)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as CustomerRow[]));
    if (!data || data.length < 1000) break;
  }
  const { data: sf, error: sfErr } = await supabase
    .from("profiles")
    .select("id, display_name, country_id");
  if (sfErr) throw new Error(sfErr.message);
  let calledIds: Set<string> | null = null;
  if (needCallRounds) {
    calledIds = new Set();
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      let q = supabase.from("customer_call_rounds").select("customer_id").in("customer_id", ids.slice(i, i + 200));
      if (p.dateFromIso) q = q.gte("call_date", p.dateFromIso.slice(0, 10));
      if (p.dateToIso) q = q.lte("call_date", p.dateToIso.slice(0, 10));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      (data ?? []).forEach((r) => calledIds!.add(r.customer_id));
    }
  }
  return { rows, staff: (sf ?? []) as Array<{ id: string; display_name: string; country_id: string | null }>, calledIds };
}


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
export type Profile = {
  id: string;
  display_name: string;
  country_id: string | null;
  is_active: boolean;
};

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
  status_changed_at: string | null;
  status_changed_by: string | null;
  store_name: string | null;
  birth_date: string | null;
  monthly_fee: number | null;
  customer_type: string | null;
  id_number?: string | null;
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
  source?: CustomerSource;
};

export const SERVER_SORT_KEYS = new Set([
  "name",
  "phone",
  "status",
  "imported_at",
  "activation_date",
  "application_date",
  "carrier_plan",
  "requested_plan",
  "signup_date",
]);

// === Lookups (countries / channels / staff) ===
export function useCustomersLookups() {
  const q = useQuery({
    queryKey: ["customers", "lookups"],
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
    queryFn: async () => {
      const [co, ch, sf] = await Promise.all([
        supabase.from("countries").select("id, code, name_ko").order("code"),
        supabase.from("channels").select("id, name").eq("is_active", true).order("name"),
        supabase
          .from("profiles")
          .select("id, display_name, country_id, is_active")
          .order("sort_order")
          .order("display_name"),
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

/** Filter options use only countries represented by customers visible under RLS. */
export function useCustomerCountryFilterOptions() {
  const q = useQuery({
    queryKey: ["customers", "countryFilterOptions"],
    staleTime: 60_000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_country_filter_options");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  return q.data ?? [];
}

// === Pool counts (tab badges) ===
export function useCustomerPoolCounts() {
  const q = useQuery({
    queryKey: ["customers", "poolCounts"],
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
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
      await Promise.all(
        POOLS.map(async (p) => {
          const { count } = await supabase
            .from("customers")
            .select("id", { count: "exact", head: true })
            .eq("pool", p);
          fallback[p] = count ?? 0;
        }),
      );
      return fallback;
    },
  });
  return { counts: q.data ?? {}, refetch: q.refetch, isLoading: q.isLoading };
}

// === Status counts (per tab cards) ===
export type StatusCountsParams = CustomerQueryFilters & { source?: CustomerSource };

export function useCustomerStatusCounts(p: StatusCountsParams) {
  const q = useQuery({
    queryKey: [...customerStatusCountsKey(p), p.source ?? "all"],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    queryFn: async (): Promise<{ counts: Record<string, number>; total: number }> => {
      if (p.source && p.source !== "all" && p.pool === "activation_request") {
        const ds = await fetchSourceDataset(p.source, false, p);
        const rows = filterSourceRows(ds.rows, p, ds.staff, null, false);
        const counts: Record<string, number> = {};
        rows.forEach((r) => (counts[r.status] = (counts[r.status] ?? 0) + 1));
        return { counts, total: rows.length };
      }
      const { data, error } = await supabase.rpc(
        "customer_filtered_status_counts",
        customerQueryFilters(p),
      );
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
    error: q.error,
    refetch: q.refetch,
  };
}

// === Search / list (search_customers RPC) ===
export type CustomersListResult = { rows: CustomerRow[]; total: number };

export function customersListQueryKey(p: CustomersSearchParams) {
  const idsKey = (p.countryIds ?? []).slice().sort().join(",");
  return [
    "customers",
    "list",
    p.pool,
    p.search ?? "",
    idsKey,
    p.assignedCountry ?? "all",
    p.status ?? "all",
    p.staff ?? "all",
    p.callRound ?? "all",
    p.sortKey,
    p.sortDir,
    p.page,
    p.pageSize,
    p.dateFromIso ?? "",
    p.dateToIso ?? "",
    p.source ?? "all",
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
      if (p.source && p.source !== "all" && p.pool === "activation_request") {
        const ds = await fetchSourceDataset(p.source, p.status === "__call_completed__", p);
        const filtered = filterSourceRows(ds.rows, p, ds.staff, ds.calledIds, true);
        const sorted = sortSourceRows(filtered, sortKeyForRpc, sortDirForRpc);
        const start = Math.max(0, (p.page - 1) * p.pageSize);
        return { rows: sorted.slice(start, start + p.pageSize), total: sorted.length };
      }
      const { data, error } = await supabase.rpc("search_customers", {
        ...customerQueryFilters(p),
        ...customerStatusFilter(p.status),
        _sort_key: sortKeyForRpc,
        _sort_dir: sortDirForRpc,
        _page: p.page,
        _page_size: p.pageSize,
      });
      if (error) throw new Error(error.message);
      const fetched = (data ?? []) as Array<{ data: CustomerRow; total_count: number }>;
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

/**
 * Pure helper: apply collected realtime updates/deletes to one cached page.
 * Returns the same object when nothing on the page changed (no re-render).
 */
export function applyCustomerChanges(
  old: CustomersListResult,
  patches: Map<string, Partial<CustomerRow>>,
  removedIds: Set<string>,
): CustomersListResult {
  let changed = false;
  let removed = 0;
  const rows: CustomerRow[] = [];
  for (const r of old.rows) {
    if (removedIds.has(r.id)) {
      changed = true;
      removed++;
      continue;
    }
    const patch = patches.get(r.id);
    if (patch) {
      changed = true;
      rows.push({ ...r, ...patch });
    } else {
      rows.push(r);
    }
  }
  if (!changed) return old;
  return { rows, total: Math.max(0, old.total - removed) };
}
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
    /**
     * Apply many realtime changes at once (one cache write → one re-render),
     * instead of one cache write per changed customer.
     */
    applyRealtimeBatch(patches: Map<string, Partial<CustomerRow>>, removedIds: Set<string>) {
      if (patches.size === 0 && removedIds.size === 0) return;
      qc.setQueriesData<CustomersListResult>({ queryKey: ["customers", "list"] }, (old) =>
        old ? applyCustomerChanges(old, patches, removedIds) : old,
      );
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
      qc.invalidateQueries({ queryKey: ["customers", "statusCounts"] });
      qc.invalidateQueries({ queryKey: ["customers", "countryFilterOptions"] });
    },
    invalidatePoolCounts() {
      qc.invalidateQueries({ queryKey: ["customers", "poolCounts"] });
    },
  };
}
