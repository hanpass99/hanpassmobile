import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import {
  Search, Plus, RefreshCw, Upload, Download, FileSpreadsheet,
  StickyNote, Trash2, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, X, Phone, ExternalLink,
} from "lucide-react";
import { syncGoogleFormApplications, syncGoogleFormApplicationsInter } from "@/lib/google-form-sync.functions";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { MultiCountrySelect } from "@/components/MultiCountrySelect";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { dayEndIso, dayStartIso } from "@/lib/date-range";
import i18n from "@/i18n";
import {
  CUSTOMER_STATUSES, STATUS_CLASS, type CustomerStatus,
  POOLS, type CustomerPool,
} from "@/lib/labels";
import {
  useCustomersLookups, useCustomerPoolCounts, useCustomersList, useCustomersCache,
  useCustomerStatusCounts, useDebouncedValue,
  type Country, type Channel, type CustomerRow,
  SERVER_SORT_KEYS,
} from "@/hooks/use-customers";


const STATUS_LABEL = new Proxy({} as Record<CustomerStatus, string>, {
  get: (_t, p: string) => i18n.t(`status.${p}`),
});
const POOL_LABEL = new Proxy({} as Record<CustomerPool, string>, {
  get: (_t, p: string) => i18n.t(`pool.${p}`),
});
const POOL_SHORT = new Proxy({} as Record<CustomerPool, string>, {
  get: (_t, p: string) => i18n.t(`pool.short.${p}`),
});

export const Route = createLazyFileRoute("/customers")({
  component: CustomersPage,
});

type TabValue = CustomerPool | "all";

type Profile = { id: string; display_name: string; country_id: string | null; is_active: boolean };

type ImportCustomer = {
  name: string;
  phone: string;
  country_id: string | null;
  notes: string | null;
  pool: CustomerPool;
  carrier_plan: string | null;
  activation_date: string | null;
  application_date: string | null;
  requested_plan: string | null;
  charge_date?: string;
  signup_date?: string;
  charge_phone?: string | null;
  charge_amount?: number | null;
  store_name?: string | null;
  birth_date?: string | null;
  monthly_fee?: number | null;
  customer_type?: string | null;
};

type SortDir = "asc" | "desc" | null;

/** 페이지네이션 번호 목록: 1, ..., 4, 5, 6, ..., 110 형태로 줄임표 포함 */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}


const PAGE_SIZE = 25;


function SortHead({ k, children, className = "", sortKey, sortDir, onSort }: { k: string; children?: React.ReactNode; className?: string; sortKey: string; sortDir: SortDir; onSort: (key: string) => void }) {
  const isActive = sortKey === k;
  const Icon = isActive ? (sortDir === "asc" ? ArrowUp : sortDir === "desc" ? ArrowDown : ArrowUpDown) : ArrowUpDown;
  const ariaSort: "ascending" | "descending" | "none" =
    isActive && sortDir === "asc" ? "ascending" : isActive && sortDir === "desc" ? "descending" : "none";
  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
        {children} <Icon className="h-3 w-3 opacity-50" />
      </button>
    </TableHead>
  );
}

function StatusChangedCell({ c, staffById, fmtDateTime }: { c: CustomerRow; staffById: Map<string, string>; fmtDateTime: (s: string | null | undefined) => string }) {
  const who = c.status_changed_by ? staffById.get(c.status_changed_by) : null;
  return (
    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
      <div>{fmtDateTime(c.status_changed_at)}</div>
      {who && <div className="text-[11px] opacity-70">{who}</div>}
    </TableCell>
  );
}

function CheckCell({ c, isAdmin, selected, onToggle }: { c: CustomerRow; isAdmin: boolean; selected: Set<string>; onToggle: (id: string) => void }) {
  if (!isAdmin) return null;
  return (
    <TableCell className="w-10">
      <Checkbox checked={selected.has(c.id)} onCheckedChange={() => onToggle(c.id)} aria-label="select row" />
    </TableCell>
  );
}

function StatusCell({ c, onChangeStatus }: { c: CustomerRow; onChangeStatus: (id: string, status: CustomerStatus) => void }) {
  return (
    <TableCell>
      <Select value={c.status} onValueChange={(v) => onChangeStatus(c.id, v as CustomerStatus)}>
        <SelectTrigger className={`h-8 w-[140px] border-0 ${STATUS_CLASS[c.status]} font-medium`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CUSTOMER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TableCell>
  );
}

function CallRoundCell({ c, onChangeCallRound }: { c: CustomerRow; onChangeCallRound: (id: string, value: number | null) => void }) {
  const { t } = useTranslation();
  return (
    <TableCell>
      <Select
        value={c.call_round ? String(c.call_round) : "__none__"}
        onValueChange={(v) => onChangeCallRound(c.id, v === "__none__" ? null : Number(v))}
      >
        <SelectTrigger className="h-8 w-[90px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">-</SelectItem>
          <SelectItem value="1">{t("dashboard.round1")}</SelectItem>
          <SelectItem value="2">{t("dashboard.round2")}</SelectItem>
          <SelectItem value="3">{t("dashboard.round3")}</SelectItem>
        </SelectContent>
      </Select>
    </TableCell>
  );
}

function Assigned({
  c, staffById, isAdmin, staff, onChangeAssigned,
}: {
  c: CustomerRow;
  staffById: Map<string, string>;
  isAdmin?: boolean;
  staff?: Profile[];
  onChangeAssigned?: (id: string, userId: string | null) => void;
}) {
  const { t } = useTranslation();
  if (isAdmin && staff && onChangeAssigned) {
    return (
      <TableCell>
        <Select
          value={c.assigned_to ?? "__none__"}
          onValueChange={(v) => onChangeAssigned(c.id, v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("common.unassigned")}</SelectItem>
            {staff.filter((s) => s.is_active).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    );
  }
  return (
    <TableCell className="text-xs">
      {c.assigned_to ? (staffById.get(c.assigned_to) ?? "—") : <span className="text-muted-foreground">{t("common.unassigned")}</span>}
    </TableCell>
  );
}

function CountryCell({
  c, countryById, isAdmin, countries, onChangeCountry,
}: {
  c: CustomerRow;
  countryById: Map<string, Country>;
  isAdmin?: boolean;
  countries?: Country[];
  onChangeCountry?: (id: string, countryId: string | null) => void;
}) {
  if (isAdmin && countries && onChangeCountry) {
    return (
      <TableCell>
        <Select
          value={c.country_id ?? "__none__"}
          onValueChange={(v) => onChangeCountry(c.id, v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="-" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-</SelectItem>
            {countries.map((co) => (
              <SelectItem key={co.id} value={co.id}>{co.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    );
  }
  return <TableCell className="text-xs">{countryById.get(c.country_id ?? "")?.code ?? "-"}</TableCell>;
}

function formatPhone(phone: string): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function PhoneLink({ phone, onCall }: { phone: string; onCall: () => void }) {
  return (
    <a
      href={`tel:${phone}`}
      className="font-mono text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
      onClick={(e) => {
        e.stopPropagation();
        window.setTimeout(onCall, 1000);
      }}
    >
      <Phone className="h-3 w-3" />
      {formatPhone(phone)}
    </a>
  );
}



function CustomersPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const visiblePools = useMemo<readonly CustomerPool[]>(() => POOLS, []);
  const initialSearch = Route.useSearch();
  const initialStatus = (() => {
    const s = initialSearch.status;
    if (!s) return "all" as const;
    if (s === "__call_completed__") return "__call_completed__" as const;
    if ((CUSTOMER_STATUSES as readonly string[]).includes(s)) return s as CustomerStatus;
    return "all" as const;
  })();
  const initialTab: TabValue = (() => {
    const p = initialSearch.pool;
    if (typeof p === "string" && visiblePools.includes(p as CustomerPool)) return p as CustomerPool;
    return "existing";
  })();
  const [tab, setTab] = useState<TabValue>(initialTab);
  const [page, setPage] = useState(1);
  const [jumpPage, setJumpPage] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const [countryIds, setCountryIds] = useState<string[]>(
    initialSearch.country && initialSearch.country !== "all" ? [initialSearch.country] : []
  );
  const [assignedCountry, setAssignedCountry] = useState("all");
  const [statusF, setStatusF] = useState<"all" | CustomerStatus | "__call_completed__">(initialStatus);
  const [staffF, setStaffF] = useState("all");
  const [callRoundF, setCallRoundF] = useState<"all" | "none" | "1" | "2" | "3">("all");
  const [sortKey, setSortKey] = useState<string>("imported_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [memoTarget, setMemoTarget] = useState<CustomerRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<CustomerRow | null>(null);
  const [callLogTarget, setCallLogTarget] = useState<CustomerRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    initialSearch.from ? new Date(initialSearch.from) : undefined
  );
  const [dateTo, setDateTo] = useState<Date | undefined>(
    initialSearch.to ? new Date(initialSearch.to) : undefined
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState("");
  const [deleteAllRunning, setDeleteAllRunning] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<CustomerStatus>("new");
  const [bulkStatusRunning, setBulkStatusRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const poolCountRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 상태 변경 시 자동 재정렬 방지를 위한 표시 순서 고정
  const [pinnedOrder, setPinnedOrder] = useState<string[] | null>(null);

  useEffect(() => { importingRef.current = importing; }, [importing]);

  // === React Query: 룩업 / 풀 카운트 / 리스트 ===
  const { countries, channels, staff } = useCustomersLookups();
  const { counts: poolCounts, refetch: refetchPoolCounts } = useCustomerPoolCounts();
  const cache = useCustomersCache();

  // 검색어 디바운스는 useDebouncedValue 훅에서 처리

  // 필터/정렬/탭 변경 시 1페이지로 리셋 + 핀 해제
  useEffect(() => {
    setPinnedOrder(null);
    setPage(1);
  }, [tab, debouncedSearch, countryIds, assignedCountry, statusF, staffF, callRoundF, sortKey, sortDir, dateFrom, dateTo]);

  // 탭 전환 시 기본 정렬: 1년 개통자는 개통일 오름차순(만기 임박 우선)
  useEffect(() => {
    if (tab === "one_year_activation") {
      setSortKey("activation_date");
      setSortDir("asc");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fromIso = dateFrom ? dayStartIso(dateFrom) : null;
  const toIso = dateTo ? dayEndIso(dateTo) : null;

  const {
    rows, total, isLoading: listLoading, isFetching: listFetching, error: listError, refetch: refetchList,
  } = useCustomersList({
    pool: tab,
    search: debouncedSearch,
    countryIds,
    assignedCountry,
    status: statusF,
    staff: staffF,
    callRound: callRoundF,
    sortKey,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
    dateFromIso: fromIso,
    dateToIso: toIso,
  });

  const { counts: statusCounts, total: statusTotal } = useCustomerStatusCounts({
    pool: tab,
    countryIds,
    dateFromIso: fromIso,
    dateToIso: toIso,
  });

  useEffect(() => {
    if (listError) toast.error(t("customers.loadFailed", { msg: (listError as Error).message }));
  }, [listError]);

  // 페이지 전환 시 선택 초기화
  useEffect(() => { setSelected(new Set()); }, [page, tab]);

  const loading = listLoading;
  const loadingMore = listFetching && !listLoading;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const schedulePoolCountRefresh = () => {
    if (poolCountRefreshTimer.current) return;
    poolCountRefreshTimer.current = setTimeout(() => {
      poolCountRefreshTimer.current = null;
      void refetchPoolCounts();
    }, 1500);
  };

  // 권한 변경/로드 시 비허용 풀이 선택돼 있으면 안전한 탭으로 리셋
  useEffect(() => {
    if (tab !== "all" && !visiblePools.includes(tab as CustomerPool)) {
      setTab(visiblePools[0] ?? "existing");
    }
  }, [visiblePools, tab]);

  const loadMore = () => setPage((p) => Math.min(totalPages, p + 1));
  const loadPrevious = () => setPage((p) => Math.max(1, p - 1));

  const refresh = async () => {
    setPage(1);
    cache.invalidateList();
    cache.invalidatePoolCounts();
    await Promise.all([refetchList(), refetchPoolCounts()]);
  };
  const load = refresh;

  // 실시간 동기화: 화면에 보이는 행만 in-place 업데이트, 신규/삭제는 카운트 갱신
  useEffect(() => {
    const ch = supabase
      .channel("customers-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const n = payload.new as CustomerRow;
            cache.patchRow(n.id, n);
          } else if (payload.eventType === "DELETE") {
            const o = payload.old as { id: string };
            cache.removeRow(o.id);
          } else if (payload.eventType === "INSERT") {
            // 대량 업로드 중에는 1건마다 재집계하지 않고 업로드 완료 후 한 번만 새로고침
            if (!importingRef.current) schedulePoolCountRefresh();
          }
        }
      )
      .subscribe();
    return () => {
      if (poolCountRefreshTimer.current) clearTimeout(poolCountRefreshTimer.current);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const staffById = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach((s) => m.set(s.id, s.display_name));
    return m;
  }, [staff]);
  const staffCountryById = useMemo(() => {
    const m = new Map<string, string | null>();
    staff.forEach((s) => m.set(s.id, s.country_id));
    return m;
  }, [staff]);
  const countryById = useMemo(() => {
    const m = new Map<string, Country>();
    countries.forEach((c) => m.set(c.id, c));
    return m;
  }, [countries]);

  // 서버에서 이미 필터·정렬·페이지네이션 적용됨. 클라이언트는 표시만.
  // 단, 서버가 지원하지 않는 정렬 키(country/assigned/assigned_country)는 현재 로드된 행 한정 폴백 정렬.
  const filtered = useMemo(() => {
    let out = rows.slice();
    if (sortKey && sortDir && !SERVER_SORT_KEYS.has(sortKey)) {
      const dir = sortDir === "asc" ? 1 : -1;
      out.sort((a, b) => {
        let av: string = ""; let bv: string = "";
        if (sortKey === "country") {
          av = countryById.get(a.country_id ?? "")?.code ?? "";
          bv = countryById.get(b.country_id ?? "")?.code ?? "";
        } else if (sortKey === "assigned_country") {
          av = countryById.get(staffCountryById.get(a.assigned_to ?? "") ?? "")?.code ?? "";
          bv = countryById.get(staffCountryById.get(b.assigned_to ?? "") ?? "")?.code ?? "";
        } else if (sortKey === "assigned") {
          av = staffById.get(a.assigned_to ?? "") ?? "";
          bv = staffById.get(b.assigned_to ?? "") ?? "";
        } else {
          const k = sortKey as keyof CustomerRow;
          av = String(a[k] ?? "");
          bv = String(b[k] ?? "");
        }
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    if (pinnedOrder) {
      const idx = new Map(pinnedOrder.map((id, i) => [id, i] as const));
      out.sort((a, b) => (idx.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (idx.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    return out;
  }, [rows, sortKey, sortDir, staffById, staffCountryById, countryById, pinnedOrder, statusF]);

  const toggleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") { setSortKey(""); setSortDir(null); }
    else setSortDir("asc");
  };



  const changeStatus = async (id: string, status: CustomerStatus) => {
    const patch: { status: CustomerStatus; activation_date?: string } = { status };
    if (status === "activated") patch.activation_date = new Date().toISOString().slice(0, 10);
    // 현재 표시 순서 고정 → 상태 변경 후에도 행이 이동하지 않음
    setPinnedOrder(filtered.map((r) => r.id));
    // 낙관적 업데이트: 자동 재정렬 없이 현재 위치 유지
    cache.patchRow(id, {
      status,
      ...(status === "activated" ? { activation_date: patch.activation_date! } : {}),
      ...(status === "new" ? { assigned_to: null } : {}),
    });
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(t("status.changed", { label: STATUS_LABEL[status] }));
  };

  const changeCallRound = async (id: string, value: number | null) => {
    setPinnedOrder(filtered.map((r) => r.id));
    cache.patchRow(id, { call_round: value });
    const { error } = await supabase.from("customers").update({ call_round: value }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(t("dashboard.callRound") + " " + (value ? t("customers.orderNth", { n: value }) : t("dashboard.roundNone")));
  };

  const changeCountry = async (id: string, countryId: string | null) => {
    if (!isAdmin) return;
    cache.patchRow(id, { country_id: countryId });
    const { error } = await supabase.from("customers").update({ country_id: countryId }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(t("customers.toastCountryChanged"));
  };

  const changeAssigned = async (id: string, userId: string | null) => {
    if (!isAdmin) return;
    cache.patchRow(id, { assigned_to: userId });
    const { error } = await supabase.from("customers").update({ assigned_to: userId }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(t("customers.toastAssignedChanged"));
  };

  const deleteCustomer = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("customers").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) return toast.error(error.message);
    toast.success(t("common.deleted"));
    load();
  };

  const bulkDelete = async () => {
    // Only delete IDs visible in current filtered list to avoid stale selections across tabs
    const visibleIds = new Set(filtered.map((r) => r.id));
    const ids = Array.from(selected).filter((id) => visibleIds.has(id));
    if (!ids.length) {
      setBulkOpen(false);
      setSelected(new Set());
      return;
    }
    // Chunk to avoid PostgREST URL length limit (Bad Request on large .in() lists)
    const chunkSize = 100;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await supabase.from("customers").delete().in("id", chunk);
      if (error) {
        setBulkOpen(false);
        return toast.error(error.message);
      }
    }
    setBulkOpen(false);
    toast.success(t("customers.bulkDeleteConfirm",{count:ids.length}));
    setSelected(new Set());
    load();
  };

  const deleteAllInTab = async () => {
    if (!isAdmin) return;
    const p: CustomerPool = (tab === "all" ? "existing" : tab) as CustomerPool;
    setDeleteAllRunning(true);
    const toastId = toast.loading(t("customers.toastPoolDeleteLoading", { pool: POOL_LABEL[p] }));
    try {
      const { error } = await supabase.from("customers").delete().eq("pool", p);
      if (error) {
        toast.error(t("customers.toastDeleteFail", { msg: error.message }), { id: toastId });
        return;
      }
      toast.success(t("customers.toastPoolDeleteDone", { pool: POOL_LABEL[p] }), { id: toastId });
      setDeleteAllOpen(false);
      setDeleteAllConfirm("");
      setSelected(new Set());
      setPage(1);
      await refetchPoolCounts();
      await refetchList();
    } finally {
      setDeleteAllRunning(false);
    }
  };



  const bulkChangeStatus = async () => {
    const visibleIds = new Set(filtered.map((r) => r.id));
    const ids = Array.from(selected).filter((id) => visibleIds.has(id));
    if (!ids.length) {
      setBulkStatusOpen(false);
      setSelected(new Set());
      return;
    }
    setBulkStatusRunning(true);
    const patch: { status: CustomerStatus; activation_date?: string } = { status: bulkStatus };
    if (bulkStatus === "activated") patch.activation_date = new Date().toISOString().slice(0, 10);
    const chunkSize = 100;
    const total = ids.length;
    let done = 0;
    const toastId = toast.loading(t("customers.toastStatusChangeLoading", { done: 0, total }));
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await supabase.from("customers").update(patch).in("id", chunk);
      if (error) {
        toast.dismiss(toastId);
        setBulkStatusRunning(false);
        setBulkStatusOpen(false);
        return toast.error(error.message);
      }
      done += chunk.length;
      toast.loading(t("customers.toastStatusChangeLoading", { done, total }), { id: toastId });
    }
    toast.dismiss(toastId);
    setBulkStatusRunning(false);
    setBulkStatusOpen(false);
    toast.success(t("status.changed", { label: STATUS_LABEL[bulkStatus] }) + ` (${total})`);
    setSelected(new Set());
    load();
    refetchPoolCounts();
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => {
      const all = filtered.map((r) => r.id);
      const allChecked = all.every((id) => prev.has(id));
      if (allChecked) return new Set();
      return new Set(all);
    });
  };
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const onUpload = async (file: File) => {
    importingRef.current = true;
    setImporting(true);
    const toastId = toast.loading(t("customers.toastExcelParsing"));
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: true });

      const norm = (v: any) => String(v ?? "").trim();
      const normKey = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();
      const headerMap = new Map<string, string>();
      Object.keys(json[0] ?? {}).forEach((k) => headerMap.set(normKey(k), k));
      const pickHeader = (...keys: string[]) => keys.map((k) => headerMap.get(normKey(k))).find(Boolean);
      const headers = {
        phone: pickHeader("phone", "전화", "전화번호", "연락처", "충전번호", "충전 번호", "휴대폰", "휴대폰번호", "개통번호", "개통 번호"),
        name: pickHeader("name", "이름", "고객명", "성명"),
        country: pickHeader("country", "국가", "국적", "고객국적", "고객 국적", "nationality"),
        assignedCountry: pickHeader("담당국가", "담당 국가", "담당팀", "팀"),
        notes: pickHeader("notes", "메모", "비고", "note"),
        carrierPlan: pickHeader("요금제", "plan", "carrier_plan"),
        activationDate: pickHeader("개통일", "activation_date"),
        applicationDate: pickHeader("신청일", "application_date"),
        chargeDate: pickHeader("충전일", "충전 일", "charge_date"),
        signupDate: pickHeader("가입일", "signup_date", "등록일", "데이터등록일", "충전일", "charge_date"),
        requestedPlan: pickHeader("신청요금제", "requested_plan"),
        chargeAmount: pickHeader("충전요금", "충전금액", "charge_amount", "amount"),
        storeName: pickHeader("판매점", "매장", "store", "store_name"),
        birthDate: pickHeader("생년월일", "생일", "birth", "birth_date", "dob"),
        monthlyFee: pickHeader("월요금", "월 요금", "monthly_fee", "월납금"),
        customerType: pickHeader("구분", "고객유형", "고객 유형", "유형", "customer_type", "type"),
      };
      const valueOf = (row: Record<string, any>, key?: string) => key ? row[key] : "";
      // Excel serial / 다양한 문자열 날짜 → YYYY-MM-DD
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmtYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const serialToDate = (n: number): Date | null => {
        if (!isFinite(n) || n <= 0 || n > 2958465) return null;
        // Excel epoch: 1899-12-30 (1900 leap-year bug 보정 포함)
        const ms = Math.round((n - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      };
      const toDateStr = (v: any): string | null => {
        if (v == null || v === "") return null;
        if (v instanceof Date) return isNaN(v.getTime()) ? null : fmtYmd(v);
        if (typeof v === "number") {
          const d = serialToDate(v);
          return d ? fmtYmd(d) : null;
        }
        const s = String(v).trim();
        if (!s) return null;
        // YYYYMMDD (8자리) — 예: 19870512
        if (/^\d{8}$/.test(s)) {
          const y = +s.slice(0, 4), mo = +s.slice(4, 6), da = +s.slice(6, 8);
          const d = new Date(Date.UTC(y, mo - 1, da));
          if (!isNaN(d.getTime()) && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da) return fmtYmd(d);
        }
        // YYMMDD (6자리, 한국 주민번호 앞자리 형식) — 예: 870512
        if (/^\d{6}$/.test(s)) {
          let y = +s.slice(0, 2), mo = +s.slice(2, 4), da = +s.slice(4, 6);
          y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
          const d = new Date(Date.UTC(y, mo - 1, da));
          if (!isNaN(d.getTime()) && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da) return fmtYmd(d);
        }
        // 순수 숫자 문자열 → Excel serial (합리적 범위에서만)
        if (/^\d+(\.\d+)?$/.test(s)) {
          const n = parseFloat(s);
          if (n >= 1 && n <= 80000) {
            const d = serialToDate(n);
            if (d) return fmtYmd(d);
          }
        }
        // ISO YYYY-MM-DD
        let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (m) {
          const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
          if (!isNaN(d.getTime()) && d.getUTCMonth() === +m[2] - 1) return fmtYmd(d);
        }
        // DD/MM/YYYY or DD-MM-YYYY
        m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
        if (m) {
          let y = +m[3]; if (y < 100) y += 2000;
          const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
          if (!isNaN(d.getTime()) && d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1) return fmtYmd(d);
        }
        return null;
      };
      const countryByCode = new Map(countries.map((c) => [c.code.toUpperCase(), c.id]));
      const countryByName = new Map(countries.map((c) => [c.name_ko, c.id]));

      const seenPhones = new Set<string>();
      let dupInFile = 0, invalid = 0;

      // 1차: 파일 파싱 + 파일 내 중복 제거
      const parsed: ImportCustomer[] = json
        .map((row): ImportCustomer | null => {
          const phoneRaw = norm(valueOf(row, headers.phone));
          const nameRaw = norm(valueOf(row, headers.name));
          const phone = phoneRaw;
          const name = nameRaw || (tab === "prepaid_charge" ? phoneRaw : "");
          if (!name || !phone) { invalid++; return null; }
          if (seenPhones.has(phone)) { dupInFile++; return null; }
          seenPhones.add(phone);
          const ccRaw = norm(valueOf(row, headers.country));
          const assignedRaw = norm(valueOf(row, headers.assignedCountry));
          const ccForId = assignedRaw || ccRaw;
          const country_id = countryByCode.get(ccForId.toUpperCase()) ?? countryByName.get(ccForId) ?? null;
          const memoBase = norm(valueOf(row, headers.notes));
          const nationalityNote = (ccRaw && ccRaw !== assignedRaw) ? `국적:${ccRaw}` : "";
          const notes = [nationalityNote, memoBase].filter(Boolean).join(" / ") || null;
          const carrier_plan = norm(valueOf(row, headers.carrierPlan)) || null;
          const activation_date = toDateStr(valueOf(row, headers.activationDate));
          const application_date = toDateStr(valueOf(row, headers.applicationDate));
          const charge_date = toDateStr(valueOf(row, headers.chargeDate));
          const signup_date = toDateStr(valueOf(row, headers.signupDate));
          const requested_plan = norm(valueOf(row, headers.requestedPlan)) || null;
          const chargeAmountRaw = norm(valueOf(row, headers.chargeAmount));
          const chargeAmtNum = chargeAmountRaw ? Number(chargeAmountRaw.replace(/[, ]/g, "")) : NaN;
          const charge_amount = isFinite(chargeAmtNum) ? chargeAmtNum : null;
          const store_name = norm(valueOf(row, headers.storeName)) || null;
          const birth_date = toDateStr(valueOf(row, headers.birthDate));
          const monthlyFeeRaw = norm(valueOf(row, headers.monthlyFee));
          const monthlyFeeNum = monthlyFeeRaw ? Number(monthlyFeeRaw.replace(/[, ₩원]/g, "")) : NaN;
          const monthly_fee = isFinite(monthlyFeeNum) ? monthlyFeeNum : null;
          const customer_type = norm(valueOf(row, headers.customerType)) || null;
          const base: ImportCustomer = {
            name, phone, country_id, notes, pool: tab as CustomerPool,
            carrier_plan, activation_date,
            application_date, requested_plan,
          };
          if (charge_date) base.charge_date = charge_date;
          if (signup_date) base.signup_date = signup_date;
          if (tab === "prepaid_charge") {
            base.charge_phone = phoneRaw;
            base.charge_amount = charge_amount;
          }
          if (store_name) base.store_name = store_name;
          if (birth_date) base.birth_date = birth_date;
          if (monthly_fee !== null) base.monthly_fee = monthly_fee;
          if (customer_type) base.customer_type = customer_type;
          return base;
        })
        .filter((x): x is ImportCustomer => x !== null);

      if (!parsed.length) {
        toast.error(t("customers.toastNoUploadDataDetail", { dup: dupInFile, n: invalid }), { id: toastId });
        return;
      }

      // DB 측 중복 체크는 수행하지 않음: 같은 번호도 다른 날짜로 재등록 허용
      const finalPayload = parsed;

      // === 1년 개통자 pool: 기존 고객 있으면 pool/필드 업데이트, 없으면 insert ===
      if (tab === "one_year_activation") {
        const phones = finalPayload.map((r) => r.phone);
        const { data: existingRows } = await supabase
          .from("customers")
          .select("id, phone")
          .in("phone", phones);
        const idByPhone = new Map<string, string>();
        (existingRows ?? []).forEach((r: any) => { idByPhone.set(r.phone, r.id); });

        let updated = 0, insertedCnt = 0;
        for (let i = 0; i < finalPayload.length; i++) {
          const r = finalPayload[i];
          const eid = idByPhone.get(r.phone);
          if (eid) {
            const patch: Database["public"]["Tables"]["customers"]["Update"] = { pool: "one_year_activation" };
            if (r.name) patch.name = r.name;
            if (r.country_id) patch.country_id = r.country_id;
            if (r.carrier_plan) patch.carrier_plan = r.carrier_plan;
            if (r.activation_date) patch.activation_date = r.activation_date;
            if (r.store_name) patch.store_name = r.store_name;
            if (r.birth_date) patch.birth_date = r.birth_date;
            if (r.monthly_fee !== undefined && r.monthly_fee !== null) patch.monthly_fee = r.monthly_fee;
            if (r.customer_type) patch.customer_type = r.customer_type;
            const { error } = await supabase.from("customers").update(patch).eq("id", eid);
            if (!error) updated++;
          } else {
            const { error } = await supabase.from("customers").insert(r);
            if (!error) insertedCnt++;
          }
          if ((i + 1) % 25 === 0) {
            toast.loading(t("customers.toastProcessing", { i: i + 1, total: finalPayload.length }), { id: toastId });
          }
        }
        toast.success(
          t("customers.toastPoolUpdated", { updated: updated.toLocaleString(), new: insertedCnt.toLocaleString() })
            + (dupInFile ? t("customers.toastFileDup", { n: dupInFile }) : "")
            + (invalid ? t("customers.toastMissing", { n: invalid }) : ""),
          { id: toastId }
        );
        await refetchPoolCounts();
        setPage(1);
        await refetchList();
        return;
      }

      // 청크 단위 INSERT (500건씩)
      const insertChunkSize = 500;
      let inserted = 0;
      const totalToInsert = finalPayload.length;
      for (let i = 0; i < totalToInsert; i += insertChunkSize) {
        const chunk = finalPayload.slice(i, i + insertChunkSize);
        const { error } = await supabase.from("customers").insert(chunk);
        if (error) {
          toast.error(t("customers.toastUploadStopped", { done: inserted, total: totalToInsert, msg: error.message }), { id: toastId });
          await refetchPoolCounts();
          setPage(1);
          await refetchList();
          return;
        }
        inserted += chunk.length;
        toast.loading(t("customers.toastUploading", { done: inserted.toLocaleString(), total: totalToInsert.toLocaleString() }), { id: toastId });
      }
      toast.success(
        t("customers.toastAddedFileDup", { n: inserted.toLocaleString(), dup: dupInFile })
          + (invalid ? t("customers.toastMissing", { n: invalid }) : ""),
        { id: toastId }
      );
      await refetchPoolCounts();
      setPage(1);
      await refetchList();
    } catch (e: any) {
      toast.error(t("customers.toastExcelParseFail", { msg: e.message }), { id: toastId });
    } finally {
      importingRef.current = false;
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadSample = () => {
    const effPool: CustomerPool = (tab === "all") ? "existing" : tab;
    let sample: Record<string, unknown>[] = [];
    let header: string[] = [];
    if (effPool === "existing") {
      header = ["고객명", "전화번호", "개통일", "요금제", "국적", "메모"];
      sample = [{ 고객명: "홍길동", 전화번호: "010-1234-5678", 개통일: "2026-01-15", 요금제: "LTE 5G 무제한", 국적: "KR", 메모: "" }];
    } else if (effPool === "activation_request" || effPool === "google_form_activation" || effPool === "google_form_activation_inter") {
      header = ["고객명", "전화번호", "국적", "신청일", "신청요금제", "메모"];
      sample = [{ 고객명: "Ivan", 전화번호: "010-5555-6666", 국적: "CIS", 신청일: "2026-05-08", 신청요금제: "선불 1만원", 메모: "" }];

    } else if (effPool === "friend_referral") {
      header = ["고객명", "전화번호", "국적", "가입일", "메모"];
      sample = [{ 고객명: "CHU KHANH KHANH", 전화번호: "010-7597-3068", 국적: "VN", 가입일: "2026-06-18", 메모: "" }];
    } else if (effPool === "prepaid_charge") {
      header = ["전화번호", "국적", "충전 일", "담당자", "상태", "콜 라운드", "메모"];
      sample = [
        { 전화번호: "010-5946-4992", 국적: "CIS", "충전 일": "2026-04-25", 담당자: "", 상태: "", "콜 라운드": "", 메모: "" },
        { 전화번호: "010-6593-9433", 국적: "미얀마", "충전 일": "2026-04-25", 담당자: "", 상태: "", "콜 라운드": "", 메모: "" },
      ];
    } else if (effPool === "one_year_activation") {
      header = ["판매점", "고객명", "구분", "국적", "개통번호", "생년월일", "개통일", "요금제", "월요금"];
      sample = [
        { 판매점: "강남점", 고객명: "홍길동", 구분: "일반", 국적: "KR", 개통번호: "010-1234-5678", 생년월일: "1990-05-12", 개통일: "2025-07-15", 요금제: "LTE 5G 무제한", 월요금: 55000 },
        { 판매점: "홍대점", 고객명: "Nguyen Van A", 구분: "외국인", 국적: "VN", 개통번호: "010-8765-4321", 생년월일: "1992-03-08", 개통일: "2025-08-01", 요금제: "5G 스탠다드", 월요금: 45000 },
      ];
    } else {
      // new_signup
      header = ["고객명", "전화번호", "국적", "가입일", "담당자", "상태", "콜 라운드", "데이터 등록일", "메모"];
      sample = [{ 고객명: "Ivan", 전화번호: "010-5555-6666", 국적: "CIS", 가입일: "2026-05-08", 담당자: "", 상태: "", "콜 라운드": "", "데이터 등록일": "", 메모: "" }];
    }
    const ws = XLSX.utils.json_to_sheet(sample, { header });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `샘플_${POOL_SHORT[effPool]}.xlsx`);
  };

  // 관리자 전용: 현재 필터로 조회된 데이터를 Excel로 다운로드
  const [downloading, setDownloading] = useState(false);
  const downloadFiltered = async () => {
    if (!isAdmin) return;
    setDownloading(true);
    const toastId = toast.loading("엑셀 생성 중...");
    try {
      const EXPORT_LIMIT = 50000;
      const pageSize = 1000;
      const all: CustomerRow[] = [];
      let p = 1;
      let totalCount = 0;
      const sortKeyForRpc = sortKey || "imported_at";
      const sortDirForRpc = sortDir ?? "desc";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.rpc("search_customers", {
          _pool: tab === "all" ? undefined : tab,
          _search: debouncedSearch?.trim() || undefined,
          _country_ids: countryIds.length ? countryIds : undefined,
          _assigned_to: staffF === "all" ? undefined : (staffF === "__none__" ? "unassigned" : staffF),
          _assigned_country: assignedCountry === "all" ? undefined : (assignedCountry === "__none__" ? "none" : assignedCountry),
          _status: (statusF === "all" || statusF === "__call_completed__") ? undefined : statusF,
          _date_from: fromIso ?? undefined,
          _date_to: toIso ?? undefined,
          _sort_key: sortKeyForRpc,
          _sort_dir: sortDirForRpc,
          _page: p,
          _page_size: pageSize,
          _call_round: (callRoundF === "all" ? undefined : (callRoundF === "none" ? null : Number(callRoundF))) as number | undefined,
          _call_completed: statusF === "__call_completed__",
        });
        if (error) throw new Error(error.message);
        const chunk = ((data ?? []) as Array<{ data: CustomerRow; total_count: number }>);
        if (!chunk.length) break;
        totalCount = chunk[0].total_count ?? 0;
        all.push(...chunk.map((r) => r.data));
        toast.loading(`엑셀 생성 중... ${all.length.toLocaleString()}/${Math.min(totalCount, EXPORT_LIMIT).toLocaleString()}`, { id: toastId });
        if (all.length >= totalCount || all.length >= EXPORT_LIMIT) break;
        p += 1;
      }
      if (!all.length) {
        toast.error("다운로드할 데이터가 없습니다.", { id: toastId });
        return;
      }
      const rowsForXlsx = all.map((c) => ({
        고객명: c.name,
        전화번호: c.phone,
        국적: countryById.get(c.country_id ?? "")?.code ?? "",
        담당자: c.assigned_to ? (staffById.get(c.assigned_to) ?? "") : "",
        상태: STATUS_LABEL[c.status],
        풀: POOL_LABEL[c.pool],
        "콜 라운드": c.call_round ?? "",
        개통일: c.activation_date ?? "",
        요금제: c.carrier_plan ?? "",
        신청일: c.application_date ?? "",
        신청요금제: c.requested_plan ?? "",
        ...(tab === "prepaid_charge" ? { "충전 일": c.charge_date ?? "" } : { "가입일": c.signup_date ?? "" }),
        이메일: c.email ?? "",
        충전번호: c.charge_phone ?? "",
        "데이터 등록일": c.imported_at ? new Date(c.imported_at).toLocaleString("ko-KR") : "",
        메모: c.notes ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rowsForXlsx);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      XLSX.writeFile(wb, `고객목록_${POOL_SHORT[(tab === "all" ? "existing" : tab) as CustomerPool]}_${ts}.xlsx`);
      toast.success(`${all.length.toLocaleString()}건 다운로드 완료`, { id: toastId });
    } catch (e: any) {
      toast.error(`다운로드 실패: ${e.message}`, { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const poolCount = (p: CustomerPool) => poolCounts[p] ?? 0;

  // 담당자별 상태 통계 (현재 Pool, 현재 필터 적용 후)
  const staffStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; activated: number; in_progress: number; }>();
    filtered.forEach((r) => {
      const id = r.assigned_to ?? "__none__";
      const name = id === "__none__" ? "미배정" : (staffById.get(id) ?? "—");
      const cur = map.get(id) ?? { name, total: 0, activated: 0, in_progress: 0 };
      cur.total += 1;
      if (r.status === "activated") cur.activated += 1;
      if (r.status === "in_progress") cur.in_progress += 1;
      map.set(id, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
  }, [filtered, staffById]);

  const fmtDate = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString("ko-KR") : "-";

  const fmtDateTime = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "-";


  const StatusChangedHead = <TableHead className="whitespace-nowrap">상태 변경일</TableHead>;

  // === 풀별 컬럼 렌더러 ===
  const renderTable = (p: CustomerPool) => {
    const CheckHead = isAdmin ? (
      <TableHead className="w-10">
        <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="select all" />
      </TableHead>
    ) : null;

    const extraCols = isAdmin ? 1 : 0;

    const renderActions = (c: CustomerRow) => (
      <TableCell className="text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" onClick={() => setMemoTarget(c)}>
          <StickyNote className="mr-1 h-3.5 w-3.5" /> 메모
        </Button>
        {isAdmin && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(c.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </TableCell>
    );





    const CallRoundHead = <SortHead k="call_round" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>{t("dashboard.callRound")}</SortHead>;



    if (p === "existing") {
      return (
        <Table aria-label="Customer list">
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-[#E2E8F0]">
              {CheckHead}
              <SortHead k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead k="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>전화번호</SortHead>
              <SortHead k="activation_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>개통일</SortHead>
              <SortHead k="carrier_plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>요금제</SortHead>
              <SortHead k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>국적</SortHead>
              <SortHead k="assigned" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>담당자</SortHead>
              <SortHead k="status" className="min-w-[140px]" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>상태</SortHead>
              {CallRoundHead}
              {StatusChangedHead}
              <SortHead k="imported_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>{t("common.registeredDate")}</SortHead>
              <TableHead>메모</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/30">
                <CheckCell c={c} isAdmin={isAdmin} selected={selected} onToggle={toggleOne} />
                <TableCell className="font-medium"><button type="button" onClick={() => setDetailTarget(c)} className="text-left hover:underline">{c.name}</button></TableCell>
                <TableCell className="font-mono text-xs"><PhoneLink phone={c.phone} onCall={() => setCallLogTarget(c)} /></TableCell>
                <TableCell className="text-xs">{fmtDate(c.activation_date)}</TableCell>
                <TableCell className="text-xs">{c.carrier_plan ?? "-"}</TableCell>
                <CountryCell c={c} countryById={countryById} isAdmin={isAdmin} countries={countries} onChangeCountry={changeCountry} />
                <Assigned c={c} staffById={staffById} isAdmin={isAdmin} staff={staff} onChangeAssigned={changeAssigned} />
                <StatusCell c={c} onChangeStatus={changeStatus} />
                <CallRoundCell c={c} onChangeCallRound={changeCallRound} />
                <StatusChangedCell c={c} staffById={staffById} fmtDateTime={fmtDateTime} />
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.imported_at)}</TableCell>
                <TableCell className="text-xs max-w-[180px] truncate" title={c.notes ?? ""}>{c.notes ?? "-"}</TableCell>
                {renderActions(c)}
              </TableRow>
            ))}
            {filtered.length === 0 && <EmptyRow cols={12 + extraCols} loading={loading} pool={p} />}
          </TableBody>
        </Table>
      );
    }

    if (p === "friend_referral" || p === "prepaid_charge") {
      return (
        <Table aria-label="Customer list">
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-[#E2E8F0]">
              {CheckHead}
              <SortHead k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead k="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>전화번호</SortHead>
              <SortHead k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>국적</SortHead>
              <SortHead k={p === "prepaid_charge" ? "charge_date" : "signup_date"} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>{p === "prepaid_charge" ? "충전 일" : "가입일"}</SortHead>
              <SortHead k="assigned" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>담당자</SortHead>
              <SortHead k="status" className="min-w-[140px]" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>상태</SortHead>
              {CallRoundHead}
              {StatusChangedHead}
              <SortHead k="imported_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>{t("common.registeredDate")}</SortHead>
              <TableHead>메모</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/30">
                <CheckCell c={c} isAdmin={isAdmin} selected={selected} onToggle={toggleOne} />
                <TableCell className="font-medium"><button type="button" onClick={() => setDetailTarget(c)} className="text-left hover:underline">{c.name}</button></TableCell>
                <TableCell className="font-mono text-xs"><PhoneLink phone={c.phone} onCall={() => setCallLogTarget(c)} /></TableCell>
                <CountryCell c={c} countryById={countryById} isAdmin={isAdmin} countries={countries} onChangeCountry={changeCountry} />
                <TableCell className="text-xs">{fmtDate(p === "prepaid_charge" ? c.charge_date : c.signup_date)}</TableCell>
                <Assigned c={c} staffById={staffById} isAdmin={isAdmin} staff={staff} onChangeAssigned={changeAssigned} />
                <StatusCell c={c} onChangeStatus={changeStatus} />
                <CallRoundCell c={c} onChangeCallRound={changeCallRound} />
                <StatusChangedCell c={c} staffById={staffById} fmtDateTime={fmtDateTime} />
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.imported_at)}</TableCell>
                <TableCell className="text-xs max-w-[180px] truncate" title={c.notes ?? ""}>{c.notes ?? "-"}</TableCell>
                {renderActions(c)}
              </TableRow>
            ))}
            {filtered.length === 0 && <EmptyRow cols={12 + extraCols} loading={loading} pool={p} />}
          </TableBody>
        </Table>
      );
    }


    if (p === "one_year_activation") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysToAnniversary = (activationIso: string | null) => {
        if (!activationIso) return null;
        const d = new Date(activationIso);
        if (isNaN(d.getTime())) return null;
        const anniv = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
        anniv.setHours(0, 0, 0, 0);
        return Math.round((anniv.getTime() - today.getTime()) / 86400000);
      };
      const isNearMaturity = (n: number | null) => n !== null && n >= -3 && n < 3;
      const ddayBadge = (n: number | null) => {
        if (n === null) return <span className="text-muted-foreground">-</span>;
        const near = isNearMaturity(n);
        if (n < 0) {
          return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${near ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>만기 {Math.abs(n)}일 경과</span>;
        }
        if (n === 0) return <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">D-DAY</span>;
        const cls = near
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          : n <= 30
          ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
          : n <= 60
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
        return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>D-{n}</span>;
      };

      return (
        <Table aria-label="Customer list">
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-[#E2E8F0]">
              {CheckHead}
              <TableHead>판매점</TableHead>
              <SortHead k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>고객명</SortHead>
              <TableHead>구분</TableHead>
              <SortHead k="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>개통번호</SortHead>
              <SortHead k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>국적</SortHead>
              <TableHead>생년월일</TableHead>
              <SortHead k="activation_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>개통일</SortHead>
              <TableHead className="whitespace-nowrap">1년 만기</TableHead>
              <SortHead k="carrier_plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>요금제</SortHead>
              <TableHead>월요금</TableHead>
              <SortHead k="assigned" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>담당자</SortHead>
              <SortHead k="status" className="min-w-[140px]" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>상태</SortHead>
              {CallRoundHead}
              <TableHead>메모</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const dday = daysToAnniversary(c.activation_date);
              return (
                <TableRow key={c.id} className={cn("hover:bg-muted/30", isNearMaturity(dday) && "bg-emerald-50/50 dark:bg-emerald-950/20")}>

                  <CheckCell c={c} isAdmin={isAdmin} selected={selected} onToggle={toggleOne} />
                  <TableCell className="text-xs">{c.store_name ?? "-"}</TableCell>
                  <TableCell className="font-medium"><button type="button" onClick={() => setDetailTarget(c)} className="text-left hover:underline">{c.name}</button></TableCell>
                  <TableCell className="text-xs">{c.customer_type ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs"><PhoneLink phone={c.phone} onCall={() => setCallLogTarget(c)} /></TableCell>
                  <CountryCell c={c} countryById={countryById} isAdmin={isAdmin} countries={countries} onChangeCountry={changeCountry} />
                  <TableCell className="text-xs">{fmtDate(c.birth_date)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.activation_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{ddayBadge(dday)}</TableCell>
                  <TableCell className="text-xs">{c.carrier_plan ?? "-"}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{c.monthly_fee != null ? Number(c.monthly_fee).toLocaleString() : "-"}</TableCell>
                  <Assigned c={c} staffById={staffById} isAdmin={isAdmin} staff={staff} onChangeAssigned={changeAssigned} />
                  <StatusCell c={c} onChangeStatus={changeStatus} />
                  <CallRoundCell c={c} onChangeCallRound={changeCallRound} />
                  <TableCell className="text-xs max-w-[180px] truncate" title={c.notes ?? ""}>{c.notes ?? "-"}</TableCell>
                  {renderActions(c)}
                </TableRow>
              );
            })}
            {filtered.length === 0 && <EmptyRow cols={15 + extraCols} loading={loading} pool={p} />}
          </TableBody>
        </Table>
      );
    }

    return (
      <Table aria-label="Customer list">
        <TableHeader>
          <TableRow className="bg-slate-50 border-b border-[#E2E8F0]">
            {CheckHead}
            <SortHead k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortHead k="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>전화번호</SortHead>
            <SortHead k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>국적</SortHead>
            <SortHead k="application_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>신청일</SortHead>
            <SortHead k="requested_plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>신청 요금제</SortHead>
            <SortHead k="assigned" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>담당자</SortHead>
            <SortHead k="status" className="min-w-[140px]" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>상태</SortHead>
            {CallRoundHead}
            {StatusChangedHead}
            <SortHead k="imported_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>{t("common.registeredDate")}</SortHead>
            <TableHead>메모</TableHead>
            <TableHead className="text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((c) => (
            <TableRow key={c.id} className="hover:bg-muted/30">
              <CheckCell c={c} isAdmin={isAdmin} selected={selected} onToggle={toggleOne} />
              <TableCell className="font-medium"><button type="button" onClick={() => setDetailTarget(c)} className="text-left hover:underline">{c.name}</button></TableCell>
              <TableCell className="font-mono text-xs"><PhoneLink phone={c.phone} onCall={() => setCallLogTarget(c)} /></TableCell>
              <CountryCell c={c} countryById={countryById} isAdmin={isAdmin} countries={countries} onChangeCountry={changeCountry} />
              <TableCell className="text-xs">{fmtDate(c.application_date)}</TableCell>
              <TableCell className="text-xs">{c.requested_plan ?? "-"}</TableCell>
              <Assigned c={c} staffById={staffById} isAdmin={isAdmin} staff={staff} onChangeAssigned={changeAssigned} />
              <StatusCell c={c} onChangeStatus={changeStatus} />
              <CallRoundCell c={c} onChangeCallRound={changeCallRound} />
              <StatusChangedCell c={c} staffById={staffById} fmtDateTime={fmtDateTime} />
              <TableCell className="text-xs text-muted-foreground">{fmtDate(c.imported_at)}</TableCell>
              <TableCell className="text-xs max-w-[180px] truncate" title={c.notes ?? ""}>{c.notes ?? "-"}</TableCell>
              {renderActions(c)}
            </TableRow>
          ))}
          {filtered.length === 0 && <EmptyRow cols={12 + extraCols} loading={loading} pool={p} />}
        </TableBody>
      </Table>
    );
  };

  // === 구글폼 개통 신청 자동 동기화 (활성화: google_form_activation 탭) ===
  const syncGoogleFormFn = useServerFn(syncGoogleFormApplications);
  const syncGoogleFormMut = useMutation({
    mutationFn: () => syncGoogleFormFn(),
    onSuccess: (r) => {
      if (r.inserted > 0) {
        toast.success(`구글폼: ${r.inserted}건 새로 등록되었습니다.`);
        void refetchList();
        void refetchPoolCounts();
      }
      if (r.errors && r.errors.length > 0) {
        toast.error(`구글폼 동기화 오류: ${r.errors[0]}`);
      }
    },
    onError: (e: Error) => toast.error(`구글폼 동기화 실패: ${e.message}`),
  });
  const syncMutRef = useRef(syncGoogleFormMut);
  syncMutRef.current = syncGoogleFormMut;
  useEffect(() => {
    if (tab !== "google_form_activation") return;
    syncMutRef.current.mutate();
    const timer = setInterval(() => syncMutRef.current.mutate(), 30_000);
    return () => clearInterval(timer);
  }, [tab]);

  // === 구글폼 인터 자동 동기화 (활성화: google_form_activation_inter 탭) ===
  const syncGoogleFormInterFn = useServerFn(syncGoogleFormApplicationsInter);
  const syncGoogleFormInterMut = useMutation({
    mutationFn: () => syncGoogleFormInterFn(),
    onSuccess: (r) => {
      if (r.inserted > 0) {
        toast.success(`구글폼 인터: ${r.inserted}건 새로 등록되었습니다.`);
        void refetchList();
        void refetchPoolCounts();
      }
      if (r.errors && r.errors.length > 0) {
        toast.error(`구글폼 인터 동기화 오류: ${r.errors[0]}`);
      }
    },
    onError: (e: Error) => toast.error(`구글폼 인터 동기화 실패: ${e.message}`),
  });
  const syncInterMutRef = useRef(syncGoogleFormInterMut);
  syncInterMutRef.current = syncGoogleFormInterMut;
  useEffect(() => {
    if (tab !== "google_form_activation_inter") return;
    syncInterMutRef.current.mutate();
    const timer = setInterval(() => syncInterMutRef.current.mutate(), 30_000);
    return () => clearInterval(timer);
  }, [tab]);


  if (listError) {
    return (
      <div className="space-y-5">
        <PageHeader title="고객 관리" description="" />
        <Card role="alert">
          <CardContent className="space-y-3 p-6 text-center">
            <div className="text-sm font-semibold">고객 데이터를 불러오지 못했습니다</div>
            <div className="text-xs text-muted-foreground">{(listError as Error).message}</div>
            <Button onClick={() => void refetchList()} size="sm" aria-busy={listFetching}>
              <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1EO-U_KC27ZTYT74R5q7sODVysiv9gyfgajDskLtX3fU/edit";
  const SHEET_URL_INTER = "https://docs.google.com/spreadsheets/d/1edZ1wlgbvbB6rVq5hoCSyfCTuIsHc3j2eKC3jFwl2DM/edit";

  return (
    <div className="space-y-5">
      <PageHeader
        title="고객 관리"
        description={`${t("customers.totalDesc",{count:total.toLocaleString()})} · 표시 ${rows.length.toLocaleString()}건${loading?" · "+t("common.loading"):""}`}
        actions={
          <div className="flex items-center gap-2">
            {tab === "google_form_activation" && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <a href={SHEET_URL} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> 구글폼 시트
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncGoogleFormMut.mutate()}
                  disabled={syncGoogleFormMut.isPending}
                  aria-busy={syncGoogleFormMut.isPending}
                  title="구글폼 응답을 지금 동기화합니다 (30초마다 자동 동기화)"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncGoogleFormMut.isPending ? "animate-spin" : ""}`} />
                  구글폼 동기화
                </Button>
              </>
            )}
            {tab === "google_form_activation_inter" && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <a href={SHEET_URL_INTER} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> 구글폼 인터 시트
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncGoogleFormInterMut.mutate()}
                  disabled={syncGoogleFormInterMut.isPending}
                  aria-busy={syncGoogleFormInterMut.isPending}
                  title="구글폼 인터 응답을 지금 동기화합니다 (30초마다 자동 동기화)"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncGoogleFormInterMut.isPending ? "animate-spin" : ""}`} />
                  구글폼 인터 동기화
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={load} aria-busy={loading || loadingMore}>
              <RefreshCw className="mr-2 h-4 w-4" /> {t("common.refresh")}
            </Button>
          </div>
        }
      />



      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabValue); setSelected(new Set()); }}>
        <TabsList className="grid w-full bg-transparent p-0" style={{ gridTemplateColumns: `repeat(${visiblePools.length}, minmax(0, 1fr))` }}>
          {visiblePools.map((p) => (
            <TabsTrigger key={p} value={p} className="text-xs md:text-sm data-[state=active]:bg-[#1E3A5F] data-[state=active]:text-white text-[#64748B] bg-transparent shadow-none rounded-md">
              {POOL_SHORT[p]} <span className="ml-1 text-muted-foreground">({poolCount(p)})</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {([tab] as TabValue[]).map((tv) => {
          const p: CustomerPool = (tv === "all") ? "existing" : tv;
          return (
          <TabsContent key={tv} value={tv} className="mt-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{POOL_LABEL[p]}</div>
                  {tab === p && (
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <>
                          <input
                            ref={fileRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                          />
                          <Button variant="outline" size="sm" onClick={downloadSample}>
                            <Download className="mr-2 h-4 w-4" /> {t("customers.sample")}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing} aria-busy={importing}>
                            <Upload className="mr-2 h-4 w-4" /> {importing ? t("customers.uploading") : t("customers.excelUpload")}
                          </Button>
                          <Button variant="outline" size="sm" onClick={downloadFiltered} disabled={downloading} aria-busy={downloading}>
                            <FileSpreadsheet className="mr-2 h-4 w-4" /> {downloading ? "다운로드 중..." : "엑셀 다운로드"}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => { setDeleteAllConfirm(""); setDeleteAllOpen(true); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> 탭 전체 삭제
                          </Button>
                        </>
                      )}
                      <Button size="sm" onClick={() => setShowAdd(true)}>
                        <Plus className="mr-2 h-4 w-4" /> {t("customers.addCustomer")}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                  <button
                    type="button"
                    onClick={() => setStatusF("all")}
                    className={cn(
                      "rounded-lg border bg-card p-3 text-left transition hover:shadow-card-hover",
                      statusF === "all" ? "border-primary ring-1 ring-primary" : "border-border/60"
                    )}
                  >
                    <div className="text-[11px] font-medium text-muted-foreground">{t("status.allStatus")}</div>
                    <div className="mt-1 text-xl font-bold tracking-tight">{statusTotal.toLocaleString()}</div>
                  </button>
                  {CUSTOMER_STATUSES.map((s) => {
                    const n = statusCounts[s] ?? 0;
                    const active = statusF === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatusF(active ? "all" : s)}
                        className={cn(
                          "rounded-lg border bg-card p-3 text-left transition hover:shadow-card-hover",
                          active ? "border-primary ring-1 ring-primary" : "border-border/60"
                        )}
                      >
                        <div className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", STATUS_CLASS[s])}>
                          {STATUS_LABEL[s]}
                        </div>
                        <div className="mt-1 text-xl font-bold tracking-tight">{n.toLocaleString()}</div>
                      </button>
                    );
                  })}
                </div>


                <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t("customers.searchPlaceholder")}
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <MultiCountrySelect
                    options={countries}
                    value={countryIds}
                    onChange={setCountryIds}
                    placeholder={`${t("customers.col.customerCountry")} · ${t("dashboard.allCountries")}`}
                    className="h-10 w-full"
                  />

                  <Select value={assignedCountry} onValueChange={setAssignedCountry}>
                    <SelectTrigger><SelectValue placeholder={t("customers.col.assignedCountry")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("customers.col.assignedCountry")} · {t("dashboard.allCountries")}</SelectItem>
                      <SelectItem value="__none__">{t("common.unassigned")}</SelectItem>
                      {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusF} onValueChange={(v) => setStatusF(v as typeof statusF)}>
                    <SelectTrigger><SelectValue placeholder={t("common.status")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("status.allStatus")}</SelectItem>
                      <SelectItem value="__call_completed__">{t("dashboard.callCompleted")}</SelectItem>
                      {CUSTOMER_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={staffF} onValueChange={setStaffF}>
                    <SelectTrigger><SelectValue placeholder={t("customers.assigned")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("customers.allAssigned")}</SelectItem>
                      <SelectItem value="__none__">{t("common.unassigned")}</SelectItem>
                      {staff.filter((s) => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={callRoundF} onValueChange={(v) => setCallRoundF(v as typeof callRoundF)}>
                    <SelectTrigger><SelectValue placeholder={t("dashboard.callRound")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("dashboard.roundAll")}</SelectItem>
                      <SelectItem value="none">{t("dashboard.roundNone")}</SelectItem>
                      <SelectItem value="1">{t("dashboard.round1")}</SelectItem>
                      <SelectItem value="2">{t("dashboard.round2")}</SelectItem>
                      <SelectItem value="3">{t("dashboard.round3")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(() => {
                  const chips: { key: string; label: string; onRemove: () => void }[] = [];
                  if (debouncedSearch.trim()) {
                    chips.push({ key: "search", label: `검색: ${debouncedSearch.trim()}`, onRemove: () => setSearchInput("") });
                  }
                  if (countryIds.length > 0) {
                    const codes = countryIds.map((id) => countryById.get(id)?.code ?? id).join(", ");
                    chips.push({ key: "country", label: `국적: ${codes}`, onRemove: () => setCountryIds([]) });
                  }
                  if (statusF !== "all") {
                    const statusLabel = statusF === "__call_completed__" ? t("dashboard.callCompleted") : STATUS_LABEL[statusF as CustomerStatus];
                    chips.push({ key: "status", label: `상태: ${statusLabel}`, onRemove: () => setStatusF("all") });
                  }
                  if (staffF !== "all") {
                    const name = staffF === "__none__" ? t("common.unassigned") : (staffById.get(staffF) ?? staffF);
                    chips.push({ key: "staff", label: `담당자: ${name}`, onRemove: () => setStaffF("all") });
                  }
                  if (callRoundF !== "all") {
                    const roundLabel = callRoundF === "none" ? t("dashboard.roundNone") : `${callRoundF}차`;
                    chips.push({ key: "callRound", label: `콜 라운드: ${roundLabel}`, onRemove: () => setCallRoundF("all") });
                  }
                  if (dateFrom) {
                    chips.push({ key: "dateFrom", label: `등록일 시작: ${format(dateFrom, "yyyy-MM-dd")}`, onRemove: () => setDateFrom(undefined) });
                  }
                  if (dateTo) {
                    chips.push({ key: "dateTo", label: `등록일 종료: ${format(dateTo, "yyyy-MM-dd")}`, onRemove: () => setDateTo(undefined) });
                  }
                  if (!chips.length) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      {chips.map((chip) => (
                        <span
                          key={chip.key}
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
                        >
                          {chip.label}
                          <button
                            type="button"
                            onClick={chip.onRemove}
                            className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`${chip.label} 제거`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput("");
                          setCountryIds([]);
                          setStatusF("all");
                          setStaffF("all");
                          setCallRoundF("all");
                          setDateFrom(undefined);
                          setDateTo(undefined);
                        }}
                        className="rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-solid hover:text-foreground"
                      >
                        전체 초기화
                      </button>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("common.registeredDate")}</span>
                  <DateRangePicker label="시작" value={dateFrom} onChange={setDateFrom} />
                  <span className="text-xs text-muted-foreground">~</span>
                  <DateRangePicker label="종료" value={dateTo} onChange={setDateTo} />
                  {(dateFrom || dateTo) && (
                    <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                      {t("common.reset")}
                    </Button>
                  )}
                  {isAdmin && selected.size > 0 && tab === p && (
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setBulkStatusOpen(true)}>
                        {selected.size}건 상태 변경
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
                        <Trash2 className="mr-2 h-4 w-4" /> {t("customers.bulkDeleteBtn",{count:selected.size})}
                      </Button>
                    </div>
                  )}
                </div>

                {staffStats.length > 0 && (staffF === "all") && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="mb-2 text-xs font-semibold text-muted-foreground">{t("customers.staffStats")}</div>
                    <div className="flex flex-wrap gap-2">
                      {staffStats.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStaffF(s.id)}
                          className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs hover:bg-muted"
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="ml-2 text-muted-foreground">총 {s.total}</span>
                          <span className="ml-1.5 text-success">개통 {s.activated}</span>
                          <span className="ml-1.5 text-info">진행 {s.in_progress}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-border/60">
                  {renderTable(p)}
                </div>
                {total > PAGE_SIZE && (
                  <div className="flex flex-col items-center gap-2 pt-3">
                    <div className="flex items-center gap-3">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              aria-disabled={loadingMore || page <= 1}
                              className={page <= 1 || loadingMore ? "pointer-events-none opacity-50" : ""}
                              onClick={(e) => { e.preventDefault(); if (page > 1 && !loadingMore) loadPrevious(); }}
                            />
                          </PaginationItem>
                          {getPageNumbers(page, totalPages).map((p, i) =>
                            p === "..." ? (
                              <PaginationItem key={`e${i}`}><PaginationEllipsis /></PaginationItem>
                            ) : (
                              <PaginationItem key={p}>
                                <PaginationLink
                                  href="#"
                                  isActive={p === page}
                                  onClick={(e) => { e.preventDefault(); if (!loadingMore) setPage(p as number); }}
                                >
                                  {p}
                                </PaginationLink>
                              </PaginationItem>
                            )
                          )}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              aria-disabled={loadingMore || page >= totalPages}
                              className={page >= totalPages || loadingMore ? "pointer-events-none opacity-50" : ""}
                              onClick={(e) => { e.preventDefault(); if (page < totalPages && !loadingMore) loadMore(); }}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                      {totalPages > 5 && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-muted-foreground whitespace-nowrap">페이지로 이동:</span>
                          <Input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const n = parseInt(jumpPage, 10);
                                if (!isNaN(n) && n >= 1 && n <= totalPages) {
                                  setPage(n);
                                }
                                setJumpPage("");
                              }
                            }}
                            onBlur={() => {
                              const n = parseInt(jumpPage, 10);
                              if (!isNaN(n) && n >= 1 && n <= totalPages) {
                                setPage(n);
                              }
                              setJumpPage("");
                            }}
                            className="h-8 w-[60px] px-1.5 text-center text-sm"
                          />
                          <span className="text-muted-foreground">/ {totalPages.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {loadingMore ? "불러오는 중..." : `${page.toLocaleString()} / ${totalPages.toLocaleString()} 페이지 · 총 ${total.toLocaleString()}건 (페이지당 ${PAGE_SIZE}건)`}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          );
        })}
      </Tabs>

      <MemoDialog customer={memoTarget} onClose={() => setMemoTarget(null)} staffById={staffById} />
      <CustomerDetailSheet
        customer={detailTarget}
        onClose={() => setDetailTarget(null)}
        staffById={staffById}
        countries={countries}
        channels={channels}
        visiblePools={visiblePools}
        onChangeStatus={changeStatus}
        onSaved={(patch) => {
          if (detailTarget) cache.patchRow(detailTarget.id, patch);
        }}
        onCall={(c) => setCallLogTarget(c)}
      />
      <QuickCallLogDialog
        customer={callLogTarget}
        onClose={() => setCallLogTarget(null)}
      />
      <AddCustomerDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={load}
        countries={countries}
        channels={channels}
        defaultPool={(tab === "all" ? "existing" : tab) as CustomerPool}
        visiblePools={visiblePools}
      />
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>고객 삭제</DialogTitle>
            <DialogDescription>이 고객과 관련된 모든 데이터가 삭제됩니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={deleteCustomer}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>일괄 삭제</DialogTitle>
            <DialogDescription>선택한 {selected.size}명의 고객 데이터를 영구히 삭제합니다. 계속하시겠습니까?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={bulkDelete}>{selected.size}명 삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteAllOpen} onOpenChange={(o) => !deleteAllRunning && setDeleteAllOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>탭 전체 삭제</DialogTitle>
            <DialogDescription>
              <strong>{POOL_LABEL[(tab === "all" ? "existing" : tab) as CustomerPool]}</strong> 탭의 모든 고객 데이터({poolCount((tab === "all" ? "existing" : tab) as CustomerPool).toLocaleString()}건)를 영구히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
              <br /><br />
              계속하려면 아래에 <strong>DELETE</strong> 를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteAllConfirm}
            onChange={(e) => setDeleteAllConfirm(e.target.value)}
            placeholder="DELETE"
            disabled={deleteAllRunning}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)} disabled={deleteAllRunning}>취소</Button>
            <Button
              variant="destructive"
              onClick={deleteAllInTab}
              disabled={deleteAllConfirm !== "DELETE" || deleteAllRunning}
            >
              {deleteAllRunning ? "삭제 중..." : "전체 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkStatusOpen} onOpenChange={(o) => !bulkStatusRunning && setBulkStatusOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>일괄 상태 변경</DialogTitle>
            <DialogDescription>선택한 {selected.size}명의 상태를 일괄 변경합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>새 상태</Label>
            <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as CustomerStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusOpen(false)} disabled={bulkStatusRunning}>취소</Button>
            <Button onClick={bulkChangeStatus} disabled={bulkStatusRunning}>
              {bulkStatusRunning ? "변경 중..." : `${selected.size}명 변경`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DateRangePicker({ label, value, onChange }: { label: string; value?: Date; onChange: (d?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? format(value, "yyyy.MM.dd") : <span>{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={(d) => onChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}

function EmptyRow({ cols, loading, pool }: { cols: number; loading: boolean; pool: CustomerPool }) {
  if (loading) {
    return (
      <>
        {Array.from({ length: 10 }).map((_, i) => (
          <TableRow key={`sk-${i}`}>
            {Array.from({ length: cols }).map((__, j) => (
              <TableCell key={j} className="py-3">
                <Skeleton className="h-4 w-full max-w-[120px]" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  }
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-12 text-center text-sm text-muted-foreground">
        <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 opacity-50" />
        {`${POOL_LABEL[pool]} Pool에 고객이 없습니다.`}
      </TableCell>
    </TableRow>
  );
}

// === 메모 다이얼로그 ===
type Note = { id: string; content: string; created_at: string; author_id: string };

function MemoPanel({ customer, staffById }: { customer: CustomerRow; staffById: Map<string, string> }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (id: string) => {
    setLoading(true);
    const { data: n } = await supabase.from("customer_notes").select("*").eq("customer_id", id).order("created_at", { ascending: false });
    setNotes((n ?? []) as Note[]);
    setLoading(false);
  };

  useEffect(() => {
    setContent("");
    load(customer.id);
  }, [customer.id]);

  const save = async () => {
    if (!user || !content.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("customer_notes").insert({
      customer_id: customer.id,
      author_id: user.id,
      content: content.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setContent("");
    toast.success("메모 저장");
    load(customer.id);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>새 메모</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="고객 관련 메모를 입력하세요" />
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || !content.trim()}>
            {saving ? "저장 중..." : "메모 추가"}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>히스토리</Label>
        <div className="max-h-[300px] space-y-2 overflow-y-auto rounded border border-border/60 p-2">
          {loading && <div className="text-center text-xs text-muted-foreground py-4">불러오는 중...</div>}
          {!loading && notes.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-4">메모 기록이 없습니다.</div>
          )}
          {notes.map((n) => (
            <div key={n.id} className="rounded bg-muted/40 p-2 text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">{staffById.get(n.author_id) ?? "—"}</span>
                <span>{new Date(n.created_at).toLocaleString("ko-KR")}</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap">{n.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type CallResult = "no_answer" | "wrong_number" | "callback" | "not_interested" | "interested" | "activated" | "failed";
const CALL_RESULT_LABEL: Record<CallResult, string> = {
  no_answer: "부재중",
  wrong_number: "번호오류",
  callback: "재연락",
  not_interested: "관심없음",
  interested: "관심있음",
  activated: "개통완료",
  failed: "실패",
};
const CALL_RESULT_CLASS: Record<CallResult, string> = {
  no_answer: "bg-gray-100 text-gray-700 border-gray-300",
  wrong_number: "bg-red-100 text-red-700 border-red-300",
  callback: "bg-blue-100 text-blue-700 border-blue-300",
  not_interested: "bg-orange-100 text-orange-700 border-orange-300",
  interested: "bg-emerald-100 text-emerald-700 border-emerald-300",
  activated: "bg-green-100 text-green-700 border-green-300",
  failed: "bg-rose-100 text-rose-700 border-rose-300",
};

type CallLog = {
  id: string;
  customer_id: string;
  staff_id: string;
  call_date: string;
  duration_sec: number;
  result: CallResult;
  notes: string | null;
  is_activation: boolean;
  created_at: string;
};

function CallLogPanel({ customer, staffById }: { customer: CustomerRow; staffById: Map<string, string> }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CallResult>("no_answer");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState<string>("");
  const [isActivation, setIsActivation] = useState(false);

  const load = async (id: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("call_logs")
      .select("*")
      .eq("customer_id", id)
      .order("call_date", { ascending: false })
      .limit(20);
    setLogs((data ?? []) as CallLog[]);
    setLoading(false);
  };

  useEffect(() => {
    setResult("no_answer");
    setNotes("");
    setDuration("");
    setIsActivation(false);
    load(customer.id);
  }, [customer.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("call_logs").insert({
      customer_id: customer.id,
      staff_id: user.id,
      call_date: new Date().toISOString(),
      result,
      notes: notes.trim() || null,
      duration_sec: duration ? Math.max(0, parseInt(duration, 10) || 0) : 0,
      is_activation: isActivation,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("콜 기록 저장됨");
    setNotes("");
    setDuration("");
    setIsActivation(false);
    load(customer.id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded border border-border/60 p-3">
        <div className="space-y-2">
          <Label>결과</Label>
          <Select value={result} onValueChange={(v) => setResult(v as CallResult)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CALL_RESULT_LABEL) as CallResult[]).map((r) => (
                <SelectItem key={r} value={r}>{CALL_RESULT_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>메모</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="통화 내용 메모..." />
        </div>
        <div className="space-y-2">
          <Label>통화 시간(초)</Label>
          <Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="is_activation" checked={isActivation} onCheckedChange={(c) => setIsActivation(!!c)} />
          <Label htmlFor="is_activation" className="cursor-pointer">개통 연결</Label>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "콜 기록 저장"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>최근 기록</Label>
        <div className="max-h-[300px] space-y-2 overflow-y-auto rounded border border-border/60 p-2">
          {loading && <div className="text-center text-xs text-muted-foreground py-4">불러오는 중...</div>}
          {!loading && logs.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-4">기록 없음</div>
          )}
          {logs.map((l) => (
            <div key={l.id} className="rounded bg-muted/40 p-2 text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", CALL_RESULT_CLASS[l.result])}>
                    {CALL_RESULT_LABEL[l.result]}
                  </span>
                  {l.is_activation && (
                    <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-700">개통</span>
                  )}
                  {l.duration_sec > 0 && <span>{l.duration_sec}초</span>}
                </div>
                <span>{new Date(l.call_date).toLocaleString("ko-KR")}</span>
              </div>
              {l.notes && <div className="mt-1 whitespace-pre-wrap">{l.notes}</div>}
              <div className="mt-1 text-xs text-muted-foreground">{staffById.get(l.staff_id) ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemoDialog({ customer, onClose, staffById }: { customer: CustomerRow | null; onClose: () => void; staffById: Map<string, string> }) {

  if (!customer) return null;
  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer.name} · 메모</DialogTitle>
          <DialogDescription>{customer.phone}</DialogDescription>
        </DialogHeader>
        <MemoPanel customer={customer} staffById={staffById} />
      </DialogContent>
    </Dialog>
  );
}

type CustomerPatch = Partial<Pick<CustomerRow, "name" | "phone" | "email" | "country_id" | "channel_id" | "pool" | "notes" | "status" | "activation_date" | "assigned_to">>;

function CustomerDetailSheet({
  customer, onClose, staffById, countries, channels, visiblePools, onChangeStatus, onSaved, onCall,
}: {
  customer: CustomerRow | null;
  onClose: () => void;
  staffById: Map<string, string>;
  countries: Country[];
  channels: Channel[];
  visiblePools: readonly CustomerPool[];
  onChangeStatus: (id: string, status: CustomerStatus) => void;
  onSaved: (patch: CustomerPatch) => void;
  onCall: (c: CustomerRow) => void;
}) {
  const [form, setForm] = useState<CustomerPatch>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        country_id: customer.country_id,
        channel_id: customer.channel_id,
        pool: customer.pool,
        notes: customer.notes,
      });
    }
  }, [customer]);

  if (!customer) return null;

  const countryById = new Map(countries.map((c) => [c.id, c]));
  const country = customer.country_id ? countryById.get(customer.country_id) : null;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("customers").update(form).eq("id", customer.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    onSaved(form);
    toast.success("저장됨");
  };

  return (
    <Sheet open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {customer.name}
            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLASS[customer.status])}>
              {STATUS_LABEL[customer.status]}
            </span>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-2 text-sm">
              <PhoneLink phone={customer.phone} onCall={() => onCall(customer)} />
              {country ? <span className="text-muted-foreground">· {country.code} {country.name_ko}</span> : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          <Label>상태 변경</Label>
          <Select value={customer.status} onValueChange={(v) => onChangeStatus(customer.id, v as CustomerStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOMER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="grid w-full grid-cols-3 bg-transparent p-0">
            <TabsTrigger value="info" className="data-[state=active]:bg-[#1E3A5F] data-[state=active]:text-white text-[#64748B] bg-transparent shadow-none rounded-md">정보</TabsTrigger>
            <TabsTrigger value="memo" className="data-[state=active]:bg-[#1E3A5F] data-[state=active]:text-white text-[#64748B] bg-transparent shadow-none rounded-md">메모</TabsTrigger>
            <TabsTrigger value="calls" className="data-[state=active]:bg-[#1E3A5F] data-[state=active]:text-white text-[#64748B] bg-transparent shadow-none rounded-md">📞 콜 기록</TabsTrigger>
          </TabsList>


          <TabsContent value="info" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>전화번호</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>이메일</Label>
              <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value || null })} />
            </div>
            <div className="space-y-2">
              <Label>국가</Label>
              <Select value={form.country_id ?? ""} onValueChange={(v) => setForm({ ...form, country_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>채널</Label>
              <Select value={form.channel_id ?? ""} onValueChange={(v) => setForm({ ...form, channel_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pool</Label>
              <Select value={form.pool ?? customer.pool} onValueChange={(v) => setForm({ ...form, pool: v as CustomerPool })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {visiblePools.map((p) => <SelectItem key={p} value={p}>{POOL_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>메모(notes)</Label>
              <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
            </div>
          </TabsContent>

          <TabsContent value="memo" className="pt-3">
            <MemoPanel customer={customer} staffById={staffById} />
          </TabsContent>

          <TabsContent value="calls" className="pt-3">
            <CallLogPanel customer={customer} staffById={staffById} />
          </TabsContent>
        </Tabs>

      </SheetContent>
    </Sheet>
  );
}

function AddCustomerDialog({
  open, onClose, onAdded, countries, channels, defaultPool, visiblePools,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  countries: Country[];
  channels: Channel[];
  defaultPool: CustomerPool;
  visiblePools: readonly CustomerPool[];
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [countryId, setCountryId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("");
  const [pool, setPool] = useState<CustomerPool>(defaultPool);
  const [applicationDate, setApplicationDate] = useState("");
  const [requestedPlan, setRequestedPlan] = useState("");
  const [saving, setSaving] = useState(false);

  const requiresApplication = pool === "activation_request" || pool === "google_form_activation" || pool === "google_form_activation_inter";

  useEffect(() => {
    if (open) {
      setName(""); setPhone(""); setEmail(""); setCountryId(""); setChannelId(""); setPool(defaultPool);
      setApplicationDate(""); setRequestedPlan("");
    }
  }, [open, defaultPool]);

  const save = async () => {
    if (!name || !phone) return toast.error("이름과 전화번호는 필수입니다");
    if (requiresApplication && (!applicationDate || !requestedPlan.trim())) {
      return toast.error("신청일과 신청 요금제는 필수입니다");
    }
    setSaving(true);
    const { error } = await supabase.from("customers").insert({
      name, phone, pool,
      email: email || null,
      country_id: countryId || null,
      channel_id: channelId || null,
      application_date: applicationDate || null,
      requested_plan: requestedPlan.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("고객 추가됨");
    onAdded(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>고객 추가</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-2">
            <Label>이름 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>전화번호 *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>이메일</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Pool</Label>
            <Select value={pool} onValueChange={(v) => setPool(v as CustomerPool)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {visiblePools.map((p) => <SelectItem key={p} value={p}>{POOL_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>국가</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>채널</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>신청일 {requiresApplication && "*"}</Label>
            <Input type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>신청 요금제 {requiresApplication && "*"}</Label>
            <Input value={requestedPlan} onChange={(e) => setRequestedPlan(e.target.value)} placeholder="예: 유쓰 5G 스탠다드에센셜" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickCallLogDialog({ customer, onClose }: { customer: CustomerRow | null; onClose: () => void }) {
  const { user } = useAuth();
  const [result, setResult] = useState<CallResult>("no_answer");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setResult("no_answer");
      setNotes("");
      setDuration("");
    }
  }, [customer?.id]);

  if (!customer) return null;

  const save = async () => {
    if (!user) return toast.error("로그인이 필요합니다");
    setSaving(true);
    const { error } = await supabase.from("call_logs").insert({
      customer_id: customer.id,
      staff_id: user.id,
      call_date: new Date().toISOString(),
      result,
      notes: notes.trim() || null,
      duration_sec: duration ? Math.max(0, parseInt(duration, 10) || 0) : 0,
      is_activation: result === "activated",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("콜 기록 저장됨");
    onClose();
  };

  const QUICK_RESULTS: CallResult[] = ["no_answer", "callback", "not_interested", "interested", "activated", "wrong_number"];

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>콜 결과 입력 — {customer.name}</DialogTitle>
          <DialogDescription className="font-mono">{customer.phone}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>결과</Label>
            <Select value={result} onValueChange={(v) => setResult(v as CallResult)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUICK_RESULTS.map((r) => (
                  <SelectItem key={r} value={r}>{CALL_RESULT_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>메모</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="통화 내용..." />
          </div>
          <div className="space-y-2">
            <Label>통화 시간(초)</Label>
            <Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>저장 안함</Button>
          <Button onClick={save} disabled={saving}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
