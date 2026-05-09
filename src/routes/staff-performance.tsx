import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

export const Route = createFileRoute("/staff-performance")({
  head: () => ({ meta: [{ title: "직원 성과 — Hanpass OB CRM" }] }),
  component: StaffPerf,
});

type Row = {
  id: string; name: string;
  totalCalls: number; success: number; failed: number; missed: number; recall: number; activated: number;
  successRate: number; activationRate: number; target: number; achievement: number;
};

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
      const Y = from.getFullYear(); const M = from.getMonth() + 1;
      const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
      const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString();
      const [sf, lg, tg, rl] = await Promise.all([
        supabase.from("profiles").select("id, display_name").eq("is_active", true),
        supabase.from("call_logs").select("staff_id, result, is_activation").gte("call_date", fromIso).lte("call_date", toIso),
        supabase.from("targets").select("user_id, activation_target").eq("year", Y).eq("month", M),
        supabase.from("user_roles").select("user_id, role").eq("role", "staff"),
      ]);
      const staffIds = new Set((rl.data ?? []).map((r: any) => r.user_id));
      const staffOnly = (sf.data ?? []).filter((p) => staffIds.has(p.id));
      const out: Row[] = staffOnly.map((u) => {
        const ul = (lg.data ?? []).filter((l) => l.staff_id === u.id);
        const totalCalls = ul.length;
        const success = ul.filter((l) => l.result === "interested" || l.result === "activated").length;
        const failed = ul.filter((l) => l.result === "failed" || l.result === "wrong_number").length;
        const missed = ul.filter((l) => l.result === "no_answer").length;
        const recall = ul.filter((l) => l.result === "callback").length;
        const activated = ul.filter((l) => l.is_activation).length;
        const target = (tg.data ?? []).find((t) => t.user_id === u.id)?.activation_target ?? 0;
        return {
          id: u.id, name: u.display_name,
          totalCalls, success, failed, missed, recall, activated,
          successRate: totalCalls ? (success / totalCalls) * 100 : 0,
          activationRate: totalCalls ? (activated / totalCalls) * 100 : 0,
          target, achievement: target ? (activated / target) * 100 : 0,
        };
      }).sort((a, b) => b.activated - a.activated || b.totalCalls - a.totalCalls);
      setRows(out);
      setLoading(false);
    })();
  }, [from, to]);

  return (
    <div className="space-y-5">
      <PageHeader title="직원 랭킹" description={loading ? "로드 중..." : "관리자 제외, 선택 기간 콜·개통 실적"} />

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
                <TableHead className="text-right">전체 콜</TableHead>
                <TableHead className="text-right">개통 완료</TableHead>
                <TableHead className="text-right">성공</TableHead>
                <TableHead className="text-right">부재</TableHead>
                <TableHead className="text-right">재연락</TableHead>
                <TableHead className="text-right">성공률</TableHead>
                <TableHead className="text-right">개통률</TableHead>
                <TableHead className="min-w-[180px]">월 목표 달성</TableHead>
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
                  <TableCell className="font-semibold">{u.name}</TableCell>
                  <TableCell className="text-right font-medium">{u.totalCalls}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{u.activated}</TableCell>
                  <TableCell className="text-right text-success">{u.success}</TableCell>
                  <TableCell className="text-right">{u.missed}</TableCell>
                  <TableCell className="text-right">{u.recall}</TableCell>
                  <TableCell className="text-right">{u.successRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{u.activationRate.toFixed(1)}%</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(100, u.achievement)} className="h-2 flex-1" />
                      <span className="w-20 text-right text-xs font-medium">
                        {u.activated}/{u.target || "—"} {u.target ? `(${u.achievement.toFixed(0)}%)` : ""}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading && (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">직원이 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
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
