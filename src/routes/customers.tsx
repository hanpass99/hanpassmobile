import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Search, Plus, RefreshCw, Upload, Download, FileSpreadsheet,
  StickyNote, Trash2, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import i18n from "@/i18n";
import {
  CUSTOMER_STATUSES, STATUS_CLASS, type CustomerStatus,
  POOLS, type CustomerPool,
} from "@/lib/labels";

const STATUS_LABEL = new Proxy({} as Record<CustomerStatus, string>, {
  get: (_t, p: string) => i18n.t(`status.${p}`),
});
const POOL_LABEL = new Proxy({} as Record<CustomerPool, string>, {
  get: (_t, p: string) => i18n.t(`pool.${p}`),
});
const POOL_SHORT = new Proxy({} as Record<CustomerPool, string>, {
  get: (_t, p: string) => i18n.t(`pool.short.${p}`),
});

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "고객 관리 — Hanpass OB CRM" }] }),
  component: CustomersPage,
});

type Country = { id: string; code: string; name_ko: string };
type Channel = { id: string; name: string };
type Profile = { id: string; display_name: string; country_id: string | null };
type CustomerRow = {
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
};

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
};

type SortDir = "asc" | "desc" | null;

const PAGE_SIZE = 200;

function CustomersPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<CustomerPool>("existing");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [poolCounts, setPoolCounts] = useState<Record<string, number>>({});

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [assignedCountry, setAssignedCountry] = useState("all");
  const [statusF, setStatusF] = useState<"all" | CustomerStatus>("all");
  const [staffF, setStaffF] = useState("all");
  const [sortKey, setSortKey] = useState<string>("imported_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [memoTarget, setMemoTarget] = useState<CustomerRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const poolCountRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFetchRef = useRef(0);
  // 상태 변경 시 자동 재정렬 방지를 위한 표시 순서 고정
  const [pinnedOrder, setPinnedOrder] = useState<string[] | null>(null);

  useEffect(() => { importingRef.current = importing; }, [importing]);

  // RPC가 지원하는 정렬 키 (그 외는 클라이언트 정렬 폴백)
  const SERVER_SORT_KEYS = new Set([
    "name", "phone", "status", "imported_at", "activation_date",
    "application_date", "carrier_plan", "requested_plan",
  ]);

  // 룩업 데이터 (1회 로드)
  const loadLookups = async () => {
    const [co, ch, sf] = await Promise.all([
      supabase.from("countries").select("id, code, name_ko").eq("is_active", true).order("code"),
      supabase.from("channels").select("id, name").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, display_name, country_id").eq("is_active", true).order("sort_order").order("display_name"),
    ]);
    setCountries(co.data ?? []);
    setChannels(ch.data ?? []);
    setStaff(sf.data ?? []);
  };

  // Pool별 총 건수 (탭 뱃지용)
  const loadPoolCounts = async () => {
    const { data, error } = await (supabase as any).rpc("customer_pool_counts");
    if (!error) {
      const out: Record<string, number> = {};
      (data ?? []).forEach((r: { pool: string; cnt: number | string }) => { out[r.pool] = Number(r.cnt ?? 0); });
      setPoolCounts(out);
      return;
    }
    const fallback: Record<string, number> = {};
    await Promise.all(POOLS.map(async (p) => {
      const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("pool", p);
      fallback[p] = count ?? 0;
    }));
    setPoolCounts(fallback);
  };

  const schedulePoolCountRefresh = () => {
    if (poolCountRefreshTimer.current) return;
    poolCountRefreshTimer.current = setTimeout(() => {
      poolCountRefreshTimer.current = null;
      void loadPoolCounts();
    }, 1500);
  };

  // 서버사이드 검색 (페이지네이션)
  const fetchPage = async (pageNum: number, reset: boolean) => {
    const requestId = ++latestFetchRef.current;
    if (reset) setLoading(true); else setLoadingMore(true);
    const fromIso = dateFrom ? new Date(new Date(dateFrom).setHours(0,0,0,0)).toISOString() : null;
    const toIso = dateTo ? new Date(new Date(dateTo).setHours(23,59,59,999)).toISOString() : null;
    const sortKeyForRpc = SERVER_SORT_KEYS.has(sortKey) ? sortKey : "imported_at";
    const sortDirForRpc = sortDir ?? "desc";
    const { data, error } = await supabase.rpc("search_customers", {
      _pool: tab,
      _search: search.trim() || undefined,
      _country_id: country === "all" ? undefined : country,
      _assigned_to: staffF === "all" ? undefined : (staffF === "__none__" ? "unassigned" : staffF),
      _assigned_country: assignedCountry === "all" ? undefined : (assignedCountry === "__none__" ? "none" : assignedCountry),
      _status: statusF === "all" ? undefined : statusF,
      _date_from: fromIso ?? undefined,
      _date_to: toIso ?? undefined,
      _sort_key: sortKeyForRpc,
      _sort_dir: sortDirForRpc,
      _page: pageNum,
      _page_size: PAGE_SIZE,
    });
    if (error) {
      if (requestId !== latestFetchRef.current) return;
      toast.error(`고객 로드 실패: ${error.message}`);
      setLoading(false); setLoadingMore(false);
      return;
    }
    if (requestId !== latestFetchRef.current) return;
    const fetched = ((data ?? []) as Array<{ data: CustomerRow; total_count: number }>);
    const newRows = fetched.map((r) => r.data);
    setTotal(fetched[0]?.total_count ?? 0);
    setRows(newRows);
    setSelected(new Set());
    setLoading(false); setLoadingMore(false);
  };

  // 초기 로드
  useEffect(() => { loadLookups(); loadPoolCounts(); }, []);

  // 필터/정렬/탭 변경 시 1페이지 재조회 (디바운스)
  useEffect(() => {
    setPinnedOrder(null);
    setPage(1);
    const handle = setTimeout(() => { fetchPage(1, true); }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, country, assignedCountry, statusF, staffF, sortKey, sortDir, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadMore = async () => {
    const next = page + 1;
    setPage(next);
    await fetchPage(next, false);
  };

  const loadPrevious = async () => {
    const prev = Math.max(1, page - 1);
    setPage(prev);
    await fetchPage(prev, false);
  };

  const refresh = async () => {
    setPage(1);
    await Promise.all([fetchPage(1, true), loadPoolCounts()]);
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
            setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, ...n } : r)));
          } else if (payload.eventType === "DELETE") {
            const o = payload.old as { id: string };
            setRows((prev) => prev.filter((r) => r.id !== o.id));
            setTotal((t) => Math.max(0, t - 1));
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
    const out = rows.slice();
    if (sortKey && sortDir && !SERVER_SORT_KEYS.has(sortKey)) {
      const dir = sortDir === "asc" ? 1 : -1;
      out.sort((a: any, b: any) => {
        let av: any = ""; let bv: any = "";
        if (sortKey === "country") {
          av = countryById.get(a.country_id ?? "")?.code ?? "";
          bv = countryById.get(b.country_id ?? "")?.code ?? "";
        } else if (sortKey === "assigned_country") {
          av = countryById.get(staffCountryById.get(a.assigned_to ?? "") ?? "")?.code ?? "";
          bv = countryById.get(staffCountryById.get(b.assigned_to ?? "") ?? "")?.code ?? "";
        } else if (sortKey === "assigned") {
          av = staffById.get(a.assigned_to ?? "") ?? "";
          bv = staffById.get(b.assigned_to ?? "") ?? "";
        }
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    if (pinnedOrder) {
      const idx = new Map(pinnedOrder.map((id, i) => [id, i] as const));
      out.sort((a, b) => (idx.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (idx.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    return out;
  }, [rows, sortKey, sortDir, staffById, staffCountryById, countryById, pinnedOrder]);

  const toggleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") { setSortKey(""); setSortDir(null); }
    else setSortDir("asc");
  };

  const SortHead = ({ k, children, className = "" }: { k: string; children: React.ReactNode; className?: string }) => {
    const Icon = sortKey === k ? (sortDir === "asc" ? ArrowUp : sortDir === "desc" ? ArrowDown : ArrowUpDown) : ArrowUpDown;
    return (
      <TableHead className={className}>
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
          {children} <Icon className="h-3 w-3 opacity-50" />
        </button>
      </TableHead>
    );
  };

  const changeStatus = async (id: string, status: CustomerStatus) => {
    const patch: { status: CustomerStatus; activation_date?: string } = { status };
    if (status === "activated") patch.activation_date = new Date().toISOString().slice(0, 10);
    // 현재 표시 순서 고정 → 상태 변경 후에도 행이 이동하지 않음
    setPinnedOrder(filtered.map((r) => r.id));
    // 낙관적 업데이트: 자동 재정렬 없이 현재 위치 유지
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              ...(status === "activated" ? { activation_date: patch.activation_date! } : {}),
              ...(status === "new" ? { assigned_to: null } : {}),
            }
          : r
      )
    );
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(t("status.changed", { label: STATUS_LABEL[status] }));
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
    const toastId = toast.loading("엑셀 파싱 중...");
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
        phone: pickHeader("phone", "전화", "전화번호", "연락처", "충전번호", "충전 번호", "휴대폰", "휴대폰번호"),
        name: pickHeader("name", "이름", "고객명", "성명"),
        country: pickHeader("country", "국가", "국적", "고객국적", "고객 국적", "nationality"),
        notes: pickHeader("notes", "메모", "비고", "note"),
        carrierPlan: pickHeader("요금제", "plan", "carrier_plan"),
        activationDate: pickHeader("개통일", "activation_date"),
        applicationDate: pickHeader("신청일", "application_date"),
        chargeDate: pickHeader("충전일", "charge_date"),
        signupDate: pickHeader("가입일", "signup_date", "등록일", "데이터등록일"),
        requestedPlan: pickHeader("신청요금제", "requested_plan"),
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
        // 순수 숫자 문자열 → serial
        if (/^\d+(\.\d+)?$/.test(s)) {
          const d = serialToDate(parseFloat(s));
          if (d) return fmtYmd(d);
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
        .map((row) => {
          const phone = norm(valueOf(row, headers.phone));
          const name = norm(valueOf(row, headers.name));
          if (!name || !phone) { invalid++; return null; }
          if (seenPhones.has(phone)) { dupInFile++; return null; }
          seenPhones.add(phone);
          const cc = norm(valueOf(row, headers.country));
          const country_id = countryByCode.get(cc.toUpperCase()) ?? countryByName.get(cc) ?? null;
          const notes = norm(valueOf(row, headers.notes)) || null;
          const carrier_plan = norm(valueOf(row, headers.carrierPlan)) || null;
          const activation_date = toDateStr(valueOf(row, headers.activationDate));
          const application_date = toDateStr(valueOf(row, headers.applicationDate));
          const charge_date = toDateStr(valueOf(row, headers.chargeDate));
          const signup_date = toDateStr(valueOf(row, headers.signupDate));
          const requested_plan = norm(valueOf(row, headers.requestedPlan)) || null;
          return {
            name, phone, country_id, notes, pool: tab,
            carrier_plan, activation_date,
            application_date, requested_plan,
            ...(charge_date ? { charge_date } : {}),
            ...(signup_date ? { signup_date } : {}),
          };
        })
        .filter((x): x is ImportCustomer => x !== null);

      if (!parsed.length) {
        toast.error(`업로드할 데이터가 없습니다. (파일내 중복 ${dupInFile}건, 누락 ${invalid}건)`, { id: toastId });
        return;
      }

      // 2차: DB 측 전체 중복 체크 (chunk 1000개씩)
      toast.loading("DB 중복 체크 중...", { id: toastId });
      const dbDupSet = new Set<string>();
      const phoneList = parsed.map((p) => p.phone);
      const dupChunkSize = 1000;
      for (let i = 0; i < phoneList.length; i += dupChunkSize) {
        const chunk = phoneList.slice(i, i + dupChunkSize);
        const { data: dupes, error: dupErr } = await supabase
          .rpc("customers_existing_phones", { _pool: tab, _phones: chunk });
        if (dupErr) {
          toast.error(`중복 체크 실패: ${dupErr.message}`, { id: toastId });
          return;
        }
        (dupes ?? []).forEach((d: { phone: string }) => dbDupSet.add(d.phone));
      }
      const finalPayload = parsed.filter((p) => !dbDupSet.has(p.phone));
      const dupInDb = parsed.length - finalPayload.length;

      if (!finalPayload.length) {
        toast.error(`업로드할 데이터가 없습니다. (DB 중복 ${dupInDb}건, 파일내 중복 ${dupInFile}건, 누락 ${invalid}건)`, { id: toastId });
        return;
      }

      // 3차: 청크 단위 INSERT (500건씩)
      const insertChunkSize = 500;
      let inserted = 0;
      const totalToInsert = finalPayload.length;
      for (let i = 0; i < totalToInsert; i += insertChunkSize) {
        const chunk = finalPayload.slice(i, i + insertChunkSize);
        const { error } = await supabase.from("customers").insert(chunk);
        if (error) {
          toast.error(`업로드 중단 (${inserted}/${totalToInsert} 완료): ${error.message}`, { id: toastId });
          await loadPoolCounts();
          setPage(1);
          await fetchPage(1, true);
          return;
        }
        inserted += chunk.length;
        toast.loading(`업로드 중 ${inserted.toLocaleString()}/${totalToInsert.toLocaleString()}`, { id: toastId });
      }
      toast.success(
        `${inserted.toLocaleString()}명 추가 / DB중복 ${dupInDb}건 / 파일내중복 ${dupInFile}건${invalid ? ` / 누락 ${invalid}건` : ""}`,
        { id: toastId }
      );
      await loadPoolCounts();
      setPage(1);
      await fetchPage(1, true);
    } catch (e: any) {
      toast.error(`엑셀 파싱 실패: ${e.message}`, { id: toastId });
    } finally {
      importingRef.current = false;
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadSample = () => {
    let sample: Record<string, unknown>[] = [];
    if (tab === "existing") {
      sample = [{ 고객명: "홍길동", 전화번호: "010-1234-5678", 개통일: "2026-01-15", 요금제: "LTE 5G 무제한", 국적: "KR", 메모: "" }];
    } else {
      sample = [{ 고객명: "Ivan", 전화번호: "010-5555-6666", 국적: "CIS", 신청일: "2026-05-08", 신청요금제: "선불 1만원", 메모: "" }];
    }
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `샘플_${POOL_SHORT[tab]}.xlsx`);
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

  // === 풀별 컬럼 렌더러 ===
  const renderTable = (p: CustomerPool) => {
    const CheckHead = isAdmin ? (
      <TableHead className="w-10">
        <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="select all" />
      </TableHead>
    ) : null;
    const CheckCell = ({ c }: { c: CustomerRow }) =>
      isAdmin ? (
        <TableCell className="w-10">
          <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label="select row" />
        </TableCell>
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

    const StatusCell = ({ c }: { c: CustomerRow }) => (
      <TableCell>
        <Select value={c.status} onValueChange={(v) => changeStatus(c.id, v as CustomerStatus)}>
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

    const Assigned = ({ c }: { c: CustomerRow }) => (
      <TableCell className="text-xs">
        {c.assigned_to ? (staffById.get(c.assigned_to) ?? "—") : <span className="text-muted-foreground">{t("common.unassigned")}</span>}
      </TableCell>
    );

    if (p === "existing") {
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {CheckHead}
              <SortHead k="name">고객명</SortHead>
              <SortHead k="phone">전화번호</SortHead>
              <SortHead k="activation_date">개통일</SortHead>
              <SortHead k="carrier_plan">요금제</SortHead>
              <SortHead k="country">국적</SortHead>
              <SortHead k="assigned">담당자</SortHead>
              <SortHead k="status" className="min-w-[140px]">상태</SortHead>
              <SortHead k="imported_at">{t("common.registeredDate")}</SortHead>
              <TableHead>메모</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/30">
                <CheckCell c={c} />
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                <TableCell className="text-xs">{fmtDate(c.activation_date)}</TableCell>
                <TableCell className="text-xs">{c.carrier_plan ?? "-"}</TableCell>
                <TableCell className="text-xs">{countryById.get(c.country_id ?? "")?.code ?? "-"}</TableCell>
                <Assigned c={c} />
                <StatusCell c={c} />
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.imported_at)}</TableCell>
                <TableCell className="text-xs max-w-[180px] truncate" title={c.notes ?? ""}>{c.notes ?? "-"}</TableCell>
                {renderActions(c)}
              </TableRow>
            ))}
            {filtered.length === 0 && <EmptyRow cols={10 + extraCols} loading={loading} pool={p} />}
          </TableBody>
        </Table>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            {CheckHead}
            <SortHead k="name">고객명</SortHead>
            <SortHead k="phone">전화번호</SortHead>
            <SortHead k="country">국적</SortHead>
            <SortHead k="application_date">신청일</SortHead>
            <SortHead k="requested_plan">신청 요금제</SortHead>
            <SortHead k="assigned">담당자</SortHead>
            <SortHead k="status" className="min-w-[140px]">상태</SortHead>
            <SortHead k="imported_at">{t("common.registeredDate")}</SortHead>
            <TableHead>메모</TableHead>
            <TableHead className="text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((c) => (
            <TableRow key={c.id} className="hover:bg-muted/30">
              <CheckCell c={c} />
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="font-mono text-xs">{c.phone}</TableCell>
              <TableCell className="text-xs">{countryById.get(c.country_id ?? "")?.code ?? "-"}</TableCell>
              <TableCell className="text-xs">{fmtDate(c.application_date)}</TableCell>
              <TableCell className="text-xs">{c.requested_plan ?? "-"}</TableCell>
              <Assigned c={c} />
              <StatusCell c={c} />
              <TableCell className="text-xs text-muted-foreground">{fmtDate(c.imported_at)}</TableCell>
              <TableCell className="text-xs max-w-[180px] truncate" title={c.notes ?? ""}>{c.notes ?? "-"}</TableCell>
              {renderActions(c)}
            </TableRow>
          ))}
          {filtered.length === 0 && <EmptyRow cols={10 + extraCols} loading={loading} pool={p} />}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="고객 관리"
        description={`${t("customers.totalDesc",{count:total.toLocaleString()})} · 표시 ${rows.length.toLocaleString()}건${loading?" · "+t("common.loading"):""}`}
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> {t("common.refresh")}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => { setTab(v as CustomerPool); setSelected(new Set()); }}>
        <TabsList className="grid w-full grid-cols-2">
          {POOLS.map((p) => (
            <TabsTrigger key={p} value={p} className="text-xs md:text-sm">
              {POOL_SHORT[p]} <span className="ml-1 text-muted-foreground">({poolCount(p)})</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {POOLS.filter((p) => p === tab).map((p) => (
          <TabsContent key={p} value={p} className="mt-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{POOL_LABEL[p]}</div>
                  {isAdmin && tab === p && (
                    <div className="flex flex-wrap gap-2">
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
                      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
                        <Upload className="mr-2 h-4 w-4" /> {importing ? t("customers.uploading") : t("customers.excelUpload")}
                      </Button>
                      <Button size="sm" onClick={() => setShowAdd(true)}>
                        <Plus className="mr-2 h-4 w-4" /> {t("customers.addCustomer")}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t("customers.searchPlaceholder")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue placeholder={t("customers.col.customerCountry")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("customers.col.customerCountry")} · {t("dashboard.allCountries")}</SelectItem>
                      {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                      {CUSTOMER_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={staffF} onValueChange={setStaffF}>
                    <SelectTrigger><SelectValue placeholder={t("customers.assigned")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("customers.allAssigned")}</SelectItem>
                      <SelectItem value="__none__">{t("common.unassigned")}</SelectItem>
                      {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

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
                    <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setBulkOpen(true)}>
                      <Trash2 className="mr-2 h-4 w-4" /> {t("customers.bulkDeleteBtn",{count:selected.size})}
                    </Button>
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
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={loadPrevious} disabled={loadingMore || page <= 1}>
                      이전
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {loadingMore ? "불러오는 중..." : `${page.toLocaleString()} / ${totalPages.toLocaleString()} 페이지 · 총 ${total.toLocaleString()}건`}
                    </span>
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore || page >= totalPages}>
                      다음
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <MemoDialog customer={memoTarget} onClose={() => setMemoTarget(null)} />
      <AddCustomerDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={load}
        countries={countries}
        channels={channels}
        defaultPool={tab}
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
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-12 text-center text-sm text-muted-foreground">
        <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 opacity-50" />
        {loading ? "로드 중..." : `${POOL_LABEL[pool]} Pool에 고객이 없습니다.`}
      </TableCell>
    </TableRow>
  );
}

// === 메모 다이얼로그 ===
type Note = { id: string; content: string; created_at: string; author_id: string };

function MemoDialog({ customer, onClose }: { customer: CustomerRow | null; onClose: () => void }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (id: string) => {
    setLoading(true);
    const [{ data: n }, { data: p }] = await Promise.all([
      supabase.from("customer_notes").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, display_name"),
    ]);
    setNotes((n ?? []) as Note[]);
    const map: Record<string, string> = {};
    (p ?? []).forEach((x: any) => { map[x.id] = x.display_name; });
    setAuthors(map);
    setLoading(false);
  };

  useEffect(() => {
    if (customer) { setContent(""); load(customer.id); }
  }, [customer]);

  const save = async () => {
    if (!customer || !user || !content.trim()) return;
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

  if (!customer) return null;

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer.name} · 메모</DialogTitle>
          <DialogDescription>{customer.phone}</DialogDescription>
        </DialogHeader>
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
                    <span className="font-medium">{authors[n.author_id] ?? "—"}</span>
                    <span>{new Date(n.created_at).toLocaleString("ko-KR")}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{n.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCustomerDialog({
  open, onClose, onAdded, countries, channels, defaultPool,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  countries: Country[];
  channels: Channel[];
  defaultPool: CustomerPool;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [countryId, setCountryId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("");
  const [pool, setPool] = useState<CustomerPool>(defaultPool);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setPhone(""); setEmail(""); setCountryId(""); setChannelId(""); setPool(defaultPool);
    }
  }, [open, defaultPool]);

  const save = async () => {
    if (!name || !phone) return toast.error("이름과 전화번호는 필수입니다");
    setSaving(true);
    const { error } = await supabase.from("customers").insert({
      name, phone, pool,
      email: email || null,
      country_id: countryId || null,
      channel_id: channelId || null,
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
                {POOLS.map((p) => <SelectItem key={p} value={p}>{POOL_LABEL[p]}</SelectItem>)}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
