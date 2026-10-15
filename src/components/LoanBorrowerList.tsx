// 대출자 명단 — 고객 관리 화면의 "대출자" 탭에서 표시되는 목록.
// 국가별 탭, 조회 기간(오늘/이번 주/이번 달), 이름·전화번호 검색을 제공합니다.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw, Search, X } from "lucide-react";
import { MultiCountrySelect } from "@/components/MultiCountrySelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination";

export type LoanBorrower = {
  id: string;
  name: string;
  phone: string;
  nationality: string;
  loan_start_date: string;
};

const COUNTRY_NAME: Record<string, string> = {
  TH: "태국", UZ: "우즈베키스탄", KH: "캄보디아", VN: "베트남", ID: "인도네시아",
  LK: "스리랑카", PH: "필리핀", BD: "방글라데시", MM: "미얀마", NP: "네팔",
  MN: "몽골", TL: "동티모르", PK: "파키스탄", RU: "러시아", KG: "키르기스스탄",
  IN: "인도", LA: "라오스", TJ: "타지키스탄", KZ: "카자흐스탄",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStartStr() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** 탭 라벨용 경량 카운트 — 행을 내리지 않고 총건수만 세는 조회 */
export function useLoanBorrowerCount() {
  const { data } = useQuery({
    queryKey: ["loan-borrowers", "count"],
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("loan_borrowers")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}

/** 대출자 명단 전체(2,819건 수준)를 페이지네이션 없이 읽어온다. */
export function useLoanBorrowers(enabled: boolean) {
  return useQuery({
    queryKey: ["loan-borrowers"],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const all: LoanBorrower[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("loan_borrowers")
          .select("id, name, phone, nationality, loan_start_date")
          .order("loan_start_date", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      return all;
    },
  });
}

export function LoanBorrowerList() {
  const [countries, setCountries] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ key: keyof LoanBorrower; asc: boolean }>({ key: "loan_start_date", asc: false });
  const { data: rows, isLoading, error, refetch, isFetching } = useLoanBorrowers(true);
  const update = (action: () => void) => { action(); setPage(1); };
  const reset = () => update(() => { setCountries([]); setDateFrom(""); setDateTo(""); setSearch(""); });
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.nationality, (m.get(r.nationality) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const options = counts.map(([code]) => ({ id: code, code, name_ko: COUNTRY_NAME[code] ?? code }));
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (countries.length && !countries.includes(r.nationality)) return false;
      if (dateFrom && r.loan_start_date < dateFrom) return false;
      if (dateTo && r.loan_start_date > dateTo) return false;
      return !q || r.name.toLowerCase().includes(q) || r.phone.includes(q);
    }).sort((a, b) => (sort.asc ? 1 : -1) * a[sort.key].localeCompare(b[sort.key], "ko", { numeric: true }) || a.id.localeCompare(b.id));
  }, [rows, countries, dateFrom, dateTo, search, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const quick = (kind: "today" | "week" | "month") => update(() => {
    const t = todayStr();
    setDateTo(t);
    setDateFrom(kind === "today" ? t : kind === "week" ? weekStartStr() : monthStartStr());
  });
  const hasFilters = Boolean(countries.length || dateFrom || dateTo || search);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1);
  const summary = (label: string, count: number, active: boolean, onClick: () => void) => (
    <Button key={label} variant="outline" onClick={onClick} aria-pressed={active}
      className={cn("h-auto min-h-12 min-w-0 flex-col items-start gap-0 rounded-md bg-card px-2.5 py-1.5 text-left font-normal hover:shadow-card-hover", active ? "border-primary ring-1 ring-primary" : "border-border/60")}>
      <span className="w-full truncate text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{isLoading ? "—" : count.toLocaleString()}</span>
    </Button>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">대출자 관리</h2>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          <RotateCcw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />새로고침
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {summary("전체", rows?.length ?? 0, !countries.length, () => update(() => setCountries([])))}
        {counts.map(([code, count]) => summary(COUNTRY_NAME[code] ?? code, count, countries.includes(code), () => update(() => setCountries(countries.length === 1 && countries[0] === code ? [] : [code]))))}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => update(() => setSearch(e.target.value))} placeholder="이름 또는 전화번호 검색" aria-label="대출자 검색" className="pl-9" />
        </div>
        <MultiCountrySelect options={options} value={countries} onChange={(v) => update(() => setCountries(v))} placeholder="국적 · 전체 국가" className="h-10 w-full md:col-span-2" />
        <Select value={String(pageSize)} onValueChange={(v) => update(() => setPageSize(Number(v)))}>
          <SelectTrigger className="w-full md:col-span-2" aria-label="페이지당 표시 건수"><SelectValue /></SelectTrigger>
          <SelectContent>{[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}건씩 보기</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">대출시작일</span>
        <Input type="date" value={dateFrom} onChange={(e) => update(() => setDateFrom(e.target.value))} className="h-9 w-[150px]" aria-label="시작일" />
        <span className="text-xs text-muted-foreground">~</span>
        <Input type="date" value={dateTo} onChange={(e) => update(() => setDateTo(e.target.value))} className="h-9 w-[150px]" aria-label="종료일" />
        <Button variant="outline" size="sm" onClick={() => quick("today")}>오늘</Button>
        <Button variant="outline" size="sm" onClick={() => quick("week")}>이번 주</Button>
        <Button variant="outline" size="sm" onClick={() => quick("month")}>이번 달</Button>
      </div>
      {hasFilters && <div className="flex flex-wrap items-center gap-2">
        {countries.map((code) => <Button key={code} variant="secondary" size="sm" className="h-7 text-xs" onClick={() => update(() => setCountries(countries.filter((c) => c !== code)))}>{COUNTRY_NAME[code] ?? code}<X className="ml-1 h-3 w-3" /></Button>)}
        {search && <Button variant="secondary" size="sm" className="h-7 max-w-full text-xs" onClick={() => update(() => setSearch(""))}><span className="truncate">검색: {search}</span><X className="ml-1 h-3 w-3 shrink-0" /></Button>}
        {(dateFrom || dateTo) && <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => update(() => { setDateFrom(""); setDateTo(""); })}>{dateFrom || "전체"} ~ {dateTo || "전체"}<X className="ml-1 h-3 w-3" /></Button>}
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>전체 초기화</Button>
      </div>}
      {dateFrom && dateTo && dateFrom > dateTo && <p role="alert" className="text-sm text-destructive">시작일은 종료일 이전으로 선택해 주세요.</p>}
      {error ? <div role="alert" className="flex items-center gap-2 text-sm text-destructive">대출자 목록을 불러오지 못했습니다.<Button variant="outline" size="sm" onClick={() => refetch()}>다시 시도</Button></div> : <>
        <div className="text-xs text-muted-foreground">총 {(rows?.length ?? 0).toLocaleString()}명 · 조회 {filtered.length.toLocaleString()}건</div>
        <div className="table-scroll rounded-lg border border-border/60 [--table-max-h:70dvh]">
          <Table className="min-w-[620px]">
            <TableHeader><TableRow>
              <TableHead className="w-[60px]">번호</TableHead>
              {([ ["name", "이름"], ["phone", "전화번호"], ["nationality", "국적"], ["loan_start_date", "대출시작일"] ] as const).map(([key, label]) => <TableHead key={key} aria-sort={sort.key === key ? sort.asc ? "ascending" : "descending" : "none"}>
                <Button variant="ghost" size="sm" className="h-8 px-0 text-xs font-medium hover:bg-transparent" onClick={() => update(() => setSort({ key, asc: sort.key === key ? !sort.asc : true }))}>{label}{sort.key === key ? sort.asc ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" /> : <ArrowUpDown className="ml-1 h-3 w-3" />}</Button>
              </TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 8 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>) : !visible.length ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">조건에 맞는 대출자가 없습니다.</TableCell></TableRow> : visible.map((r, i) => <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{start + i + 1}</TableCell><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.phone}</TableCell><TableCell>{COUNTRY_NAME[r.nationality] ?? r.nationality}</TableCell><TableCell>{r.loan_start_date}</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col items-center gap-2 pt-3">
          {totalPages > 1 && <div className="max-w-full overflow-x-auto pb-1"><Pagination><PaginationContent>
            <PaginationItem><PaginationPrevious href="#" aria-disabled={currentPage <= 1} className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); setPage(Math.max(1, currentPage - 1)); }} /></PaginationItem>
            {pageNumbers.map((n, i) => <PaginationItem key={n} className="flex items-center">{i > 0 && n - pageNumbers[i - 1] > 1 && <PaginationEllipsis /> }<PaginationLink href="#" isActive={n === currentPage} onClick={(e) => { e.preventDefault(); setPage(n); }}>{n}</PaginationLink></PaginationItem>)}
            <PaginationItem><PaginationNext href="#" aria-disabled={currentPage >= totalPages} className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); setPage(Math.min(totalPages, currentPage + 1)); }} /></PaginationItem>
          </PaginationContent></Pagination></div>}
          <p className="text-xs text-muted-foreground">{currentPage} / {totalPages} 페이지 · {filtered.length.toLocaleString()}건 · {pageSize}건씩</p>
        </div>
      </>}
    </div>
  );
}
