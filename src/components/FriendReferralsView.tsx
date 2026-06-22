import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Upload, Download, RefreshCw, FileSpreadsheet, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const PAGE_SIZE = 50;

type ReferralRow = {
  id: string;
  member_no: string;
  name: string;
  phone: string;
  country_code: string | null;
  channel: string | null;
  signup_ym: string | null;
  signup_date: string | null;
  imported_at: string;
};

type SortKey = "member_no" | "name" | "phone" | "country_code" | "channel" | "signup_ym" | "signup_date" | "imported_at";
type SortDir = "asc" | "desc";

function formatPhone(phone: string): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

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

function normalizeYmd(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalizePhone(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\s+/g, "").trim();
}

export function FriendReferralsView() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [jumpPage, setJumpPage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [countryF, setCountryF] = useState<string>("all");
  const [channelF, setChannelF] = useState<string>("all");
  const [ymF, setYmF] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("signup_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [importing, setImporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(h);
  }, [searchInput]);

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [search, countryF, channelF, ymF, sortKey, sortDir]);

  const query = useQuery({
    queryKey: ["friend_referrals", { search, countryF, channelF, ymF, sortKey, sortDir, page }] as const,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from("friend_referrals")
        .select("id, member_no, name, phone, country_code, channel, signup_ym, signup_date, imported_at", { count: "exact" });

      if (search.trim()) {
        const s = search.trim().replace(/[,()]/g, " ");
        q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,member_no.ilike.%${s}%`);
      }
      if (countryF !== "all") q = q.eq("country_code", countryF);
      if (channelF !== "all") q = q.eq("channel", channelF);
      if (ymF !== "all") q = q.eq("signup_ym", ymF);

      q = q.order(sortKey, { ascending: sortDir === "asc", nullsFirst: false });

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as ReferralRow[], total: count ?? 0 };
    },
  });

  // Distinct values for filters
  const facets = useQuery({
    queryKey: ["friend_referrals", "facets"] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friend_referrals")
        .select("country_code, channel, signup_ym")
        .limit(5000);
      if (error) throw new Error(error.message);
      const countries = new Set<string>();
      const channels = new Set<string>();
      const yms = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r.country_code) countries.add(r.country_code);
        if (r.channel) channels.add(r.channel);
        if (r.signup_ym) yms.add(r.signup_ym);
      });
      return {
        countries: Array.from(countries).sort(),
        channels: Array.from(channels).sort(),
        yms: Array.from(yms).sort().reverse(),
      };
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loading = query.isLoading;
  const fetching = query.isFetching && !query.isLoading;

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  function SortHead({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className="whitespace-nowrap">
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {children}
          <Icon className="h-3 w-3 opacity-60" />
        </button>
      </TableHead>
    );
  }

  async function onUpload(file: File) {
    if (importing) return;
    setImporting(true);
    const toastId = toast.loading("엑셀 분석 중...");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "", raw: false });

      const records: Array<Partial<ReferralRow>> = [];
      for (const row of json) {
        // Try multiple header variants
        const member_no = String(row["회원번호"] ?? row["member_no"] ?? row["회원 번호"] ?? "").trim();
        const name = String(row["이름"] ?? row["name"] ?? row["고객명"] ?? "").trim();
        const phone = normalizePhone(row["전화번호"] ?? row["phone"] ?? row["연락처"]);
        if (!member_no && !name && !phone) continue;
        if (!name || !phone) continue;
        const country_code = String(row["국적"] ?? row["country_code"] ?? row["country"] ?? "").trim() || null;
        const channel = String(row["유입채널"] ?? row["channel"] ?? "").trim() || null;
        const ymRaw = row["가입년월"] ?? row["signup_ym"];
        const signup_ym = ymRaw == null || ymRaw === "" ? null : String(ymRaw).trim();
        const signup_date = normalizeYmd(row["가입일자"] ?? row["signup_date"]);
        records.push({
          member_no: member_no || phone,
          name,
          phone,
          country_code,
          channel,
          signup_ym,
          signup_date,
        });
      }

      if (!records.length) {
        toast.error("불러올 데이터가 없습니다", { id: toastId });
        return;
      }

      // Chunked insert
      let inserted = 0;
      const chunkSize = 500;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await supabase.from("friend_referrals").insert(chunk as any);
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }

      toast.success(`${inserted.toLocaleString()}건 등록 완료`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["friend_referrals"] });
    } catch (e: any) {
      toast.error(`업로드 실패: ${e.message}`, { id: toastId });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadSample() {
    const ws = XLSX.utils.json_to_sheet([
      {
        회원번호: "1674970",
        이름: "CHU KHANH KHANH",
        전화번호: "01075973068",
        국적: "VN",
        유입채널: "FRIENDS",
        가입년월: "202606",
        가입일자: "20260618",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "친구추천");
    XLSX.writeFile(wb, "친구추천_샘플.xlsx");
  }

  async function downloadFiltered() {
    const toastId = toast.loading("다운로드 준비 중...");
    try {
      let q = supabase.from("friend_referrals").select("*");
      if (search.trim()) {
        const s = search.trim().replace(/[,()]/g, " ");
        q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,member_no.ilike.%${s}%`);
      }
      if (countryF !== "all") q = q.eq("country_code", countryF);
      if (channelF !== "all") q = q.eq("channel", channelF);
      if (ymF !== "all") q = q.eq("signup_ym", ymF);
      q = q.order(sortKey, { ascending: sortDir === "asc", nullsFirst: false }).limit(50000);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data ?? []).map((c: any) => ({
        회원번호: c.member_no,
        이름: c.name,
        전화번호: c.phone,
        국적: c.country_code ?? "",
        유입채널: c.channel ?? "",
        가입년월: c.signup_ym ?? "",
        가입일자: c.signup_date ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "친구추천");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      XLSX.writeFile(wb, `친구추천_${ts}.xlsx`);
      toast.success(`${rows.length.toLocaleString()}건 다운로드 완료`, { id: toastId });
    } catch (e: any) {
      toast.error(`다운로드 실패: ${e.message}`, { id: toastId });
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const { error } = await supabase.from("friend_referrals").delete().eq("id", id);
    if (error) {
      toast.error(`삭제 실패: ${error.message}`);
      return;
    }
    toast.success("삭제되었습니다");
    qc.invalidateQueries({ queryKey: ["friend_referrals"] });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">친구 추천</div>
            <div className="text-xs text-muted-foreground">
              총 {total.toLocaleString()}건 · 표시 {rows.length.toLocaleString()}건{loading ? " · 불러오는 중..." : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => query.refetch()} aria-busy={fetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", fetching && "animate-spin")} /> 새로고침
            </Button>
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
                  <Download className="mr-2 h-4 w-4" /> 샘플
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing} aria-busy={importing}>
                  <Upload className="mr-2 h-4 w-4" /> {importing ? "업로드 중..." : "엑셀 업로드"}
                </Button>
                <Button variant="outline" size="sm" onClick={downloadFiltered}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> 엑셀 다운로드
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="회원번호, 이름, 전화번호 검색"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={countryF} onValueChange={setCountryF}>
            <SelectTrigger><SelectValue placeholder="국적" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 국적</SelectItem>
              {(facets.data?.countries ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channelF} onValueChange={setChannelF}>
            <SelectTrigger><SelectValue placeholder="유입채널" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 채널</SelectItem>
              {(facets.data?.channels ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ymF} onValueChange={setYmF}>
            <SelectTrigger><SelectValue placeholder="가입년월" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 가입년월</SelectItem>
              {(facets.data?.yms ?? []).map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/60">
          <Table aria-label="Friend referrals">
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-[#E2E8F0]">
                <SortHead k="member_no">회원번호</SortHead>
                <SortHead k="name">이름</SortHead>
                <SortHead k="phone">전화번호</SortHead>
                <SortHead k="country_code">국적</SortHead>
                <SortHead k="channel">유입채널</SortHead>
                <SortHead k="signup_ym">가입년월</SortHead>
                <SortHead k="signup_date">가입일자</SortHead>
                {isAdmin && <TableHead className="text-right">액션</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{r.member_no}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <a href={`tel:${r.phone}`} className="hover:underline text-primary">
                      {formatPhone(r.phone)}
                    </a>
                  </TableCell>
                  <TableCell className="text-xs">{r.country_code ?? "-"}</TableCell>
                  <TableCell className="text-xs">{r.channel ?? "-"}</TableCell>
                  <TableCell className="text-xs">{r.signup_ym ?? "-"}</TableCell>
                  <TableCell className="text-xs">{r.signup_date ?? "-"}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-sm text-muted-foreground">
                    {loading ? "불러오는 중..." : "등록된 친구 추천 데이터가 없습니다."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {total > PAGE_SIZE && (
          <div className="flex flex-col items-center gap-2 pt-3">
            <div className="flex items-center gap-3">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={fetching || page <= 1}
                      className={page <= 1 || fetching ? "pointer-events-none opacity-50" : ""}
                      onClick={(e) => { e.preventDefault(); if (page > 1 && !fetching) setPage(page - 1); }}
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
                          onClick={(e) => { e.preventDefault(); if (!fetching) setPage(p as number); }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={fetching || page >= totalPages}
                      className={page >= totalPages || fetching ? "pointer-events-none opacity-50" : ""}
                      onClick={(e) => { e.preventDefault(); if (page < totalPages && !fetching) setPage(page + 1); }}
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
                        if (!isNaN(n) && n >= 1 && n <= totalPages) setPage(n);
                        setJumpPage("");
                      }
                    }}
                    onBlur={() => {
                      const n = parseInt(jumpPage, 10);
                      if (!isNaN(n) && n >= 1 && n <= totalPages) setPage(n);
                      setJumpPage("");
                    }}
                    className="h-8 w-[60px] px-1.5 text-center text-sm"
                  />
                  <span className="text-muted-foreground">/ {totalPages.toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {fetching ? "불러오는 중..." : `${page.toLocaleString()} / ${totalPages.toLocaleString()} 페이지 · 총 ${total.toLocaleString()}건`}
            </div>
          </div>
        )}

        <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>친구 추천 삭제</DialogTitle>
              <DialogDescription>이 항목을 영구히 삭제합니다.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
              <Button variant="destructive" onClick={confirmDelete}>삭제</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
