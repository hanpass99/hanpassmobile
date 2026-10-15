import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export const Route = createFileRoute("/loans")({
  head: () => ({
    meta: [
      { title: "대출자 관리 — Hanpass OB CRM" },
      { name: "description", content: "대출자 명단을 국가별로 조회" },
      { property: "og:title", content: "대출자 관리 — Hanpass OB CRM" },
      { property: "og:description", content: "대출자 명단을 국가별로 조회" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoansPage,
});

type LoanBorrower = {
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

function LoansPage() {
  const [country, setCountry] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["loan-borrowers"],
    staleTime: 60_000,
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

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.nationality, (m.get(r.nationality) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (country !== "all" && r.nationality !== country) return false;
      if (dateFrom && r.loan_start_date < dateFrom) return false;
      if (dateTo && r.loan_start_date > dateTo) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.phone.includes(q)) return false;
      return true;
    });
  }, [rows, country, dateFrom, dateTo, search]);

  const quick = (kind: "today" | "week" | "month") => {
    const t = todayStr();
    setDateTo(t);
    setDateFrom(kind === "today" ? t : kind === "week" ? weekStartStr() : monthStartStr());
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="대출자 관리"
        description={`총 ${(rows?.length ?? 0).toLocaleString()}명 · 표시 ${filtered.length.toLocaleString()}건${isLoading ? " · 불러오는 중" : ""}`}
      />

      {/* 국가별 탭 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCountry("all")}
          className={cn(
            "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
            country === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          전체 ({(rows?.length ?? 0).toLocaleString()})
        </button>
        {counts.map(([code, cnt]) => (
          <button
            key={code}
            onClick={() => setCountry(code)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              country === code
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {COUNTRY_NAME[code] ?? code} ({cnt.toLocaleString()})
          </button>
        ))}
      </div>

      {/* 조회 기간 + 검색 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted-foreground">조회 기간</span>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 w-[150px]"
          aria-label="시작일"
        />
        <span className="text-muted-foreground">~</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 w-[150px]"
          aria-label="종료일"
        />
        <Button variant="outline" size="sm" onClick={() => quick("today")}>오늘</Button>
        <Button variant="outline" size="sm" onClick={() => quick("week")}>이번 주</Button>
        <Button variant="outline" size="sm" onClick={() => quick("month")}>이번 달</Button>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
            기간 초기화
          </Button>
        )}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 전화번호 검색"
            className="h-9 w-[220px] pl-8"
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">번호</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>전화번호</TableHead>
              <TableHead>국적</TableHead>
              <TableHead>대출시작일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  조건에 맞는 대출자가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.phone}</TableCell>
                  <TableCell>{COUNTRY_NAME[r.nationality] ?? r.nationality}</TableCell>
                  <TableCell>{r.loan_start_date}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
