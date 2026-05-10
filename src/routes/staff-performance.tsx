import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_STATUSES, STATUS_LABEL, type CustomerStatus } from "@/lib/labels";

export const Route = createFileRoute("/staff-performance")({
  head: () => ({ meta: [{ title: "직원 성과 — Hanpass OB CRM" }] }),
  component: StaffPerf,
});

type Counts = Record<CustomerStatus, number>;
type Row = { id: string; name: string; total: number; counts: Counts; tier: Tier };

type Tier = { label: string; cls: string };
function tierFor(activated: number): Tier {
  if (activated >= 50) return { label: "다이아", cls: "bg-info/15 text-info" };
  if (activated >= 30) return { label: "플래티넘", cls: "bg-primary-soft text-primary" };
  if (activated >= 15) return { label: "골드", cls: "bg-warning/20 text-warning-foreground" };
  if (activated >= 5)  return { label: "실버", cls: "bg-muted text-foreground" };
  if (activated >= 1)  return { label: "브론즈", cls: "bg-destructive/10 text-destructive" };
  return { label: "신입", cls: "bg-muted text-muted-foreground" };
}

const emptyCounts = (): Counts => Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Counts;

function StaffPerf() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState<Date>(start);
  const [to, setTo] = useState<Date>(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
      const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString();
      const [sf, cu, rl] = await Promise.all([
        supabase.from("profiles").select("id, display_name").eq("is_active", true),
        supabase.from("customers").select("assigned_to, status, updated_at").gte("updated_at", fromIso).lte("updated_at", toIso),
        supabase.from("user_roles").select("user_id, role").eq("role", "staff"),
      ]);
      const staffIds = new Set((rl.data ?? []).map((r: any) => r.user_id));
      const staffOnly = (sf.data ?? []).filter((p) => staffIds.has(p.id));
      const out: Row[] = staffOnly.map((u) => {
        const counts = emptyCounts();
        let total = 0;
        for (const c of cu.data ?? []) {
          if (c.assigned_to !== u.id) continue;
          const s = c.status as CustomerStatus;
          if (counts[s] !== undefined) counts[s]++;
          total++;
        }
        return { id: u.id, name: u.display_name, total, counts, tier: tierFor(counts.activated) };
      }).sort((a, b) => b.counts.activated - a.counts.activated || b.total - a.total);
      setRows(out);
      setLoading(false);
    })();
  }, [from, to]);

  return (
    <div className="space-y-5">
      <PageHeader title="직원 랭킹" description={loading ? "로드 중..." : "관리자 제외 · 고객 상태 기준 실적"} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">시작일</div>
            <DatePick value={from} onChange={setFrom} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">종료일</div>
            <DatePick value={to} onChange={setTo} />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFrom(start); setTo(today); }}>
            이번 달
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-12">순위</TableHead>
                <TableHead>직원</TableHead>
                <TableHead>등급</TableHead>
                <TableHead className="text-right">전체 콜수</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{STATUS_LABEL[s]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u, i) => (
                <TableRow key={u.id}>
                  <TableCell>
                    {i < 3 ? (
                      <div className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                        i === 0 && "bg-warning/20 text-warning-foreground",
                        i === 1 && "bg-muted text-foreground",
                        i === 2 && "bg-destructive/15 text-destructive",
                      )}>
                        <Trophy className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">{i + 1}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold whitespace-nowrap">{u.name}</TableCell>
                  <TableCell>
                    <Badge className={cn("border-transparent", u.tier.cls)}>{u.tier.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">{u.total}</TableCell>
                  {CUSTOMER_STATUSES.map((s) => (
                    <TableCell key={s} className={cn(
                      "text-right",
                      s === "activated" && "font-bold text-primary",
                    )}>{u.counts[s]}</TableCell>
                  ))}
                </TableRow>
              ))}
              {!rows.length && !loading && (
                <TableRow><TableCell colSpan={4 + CUSTOMER_STATUSES.length} className="text-center py-8 text-sm text-muted-foreground">직원이 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-2">개통 완료 등급 기준</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="bg-info/15 text-info border-transparent">다이아 50+</Badge>
            <Badge className="bg-primary-soft text-primary border-transparent">플래티넘 30+</Badge>
            <Badge className="bg-warning/20 text-warning-foreground border-transparent">골드 15+</Badge>
            <Badge className="bg-muted text-foreground border-transparent">실버 5+</Badge>
            <Badge className="bg-destructive/10 text-destructive border-transparent">브론즈 1+</Badge>
            <Badge className="bg-muted text-muted-foreground border-transparent">신입 0</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DatePick({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(value, "yyyy.MM.dd")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
