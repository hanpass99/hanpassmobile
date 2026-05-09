import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const Y = now.getFullYear(); const M = now.getMonth() + 1;
      const monthStart = new Date(Y, M - 1, 1).toISOString();
      const [sf, lg, tg, rl] = await Promise.all([
        supabase.from("profiles").select("id, display_name").eq("is_active", true),
        supabase.from("call_logs").select("staff_id, result, is_activation").gte("call_date", monthStart),
        supabase.from("targets").select("user_id, activation_target").eq("year", Y).eq("month", M),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const staffOnly = (sf.data ?? []).filter((p) => (rl.data ?? []).some((r) => r.user_id === p.id && r.role === "staff"));
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
      }).sort((a, b) => b.achievement - a.achievement);
      setRows(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title="직원 성과" description={loading ? "로드 중..." : "이번 달 직원별 콜 및 개통 실적"} />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>직원</TableHead>
                <TableHead className="text-right">전체 콜</TableHead>
                <TableHead className="text-right">성공</TableHead>
                <TableHead className="text-right">실패</TableHead>
                <TableHead className="text-right">부재중</TableHead>
                <TableHead className="text-right">재연락</TableHead>
                <TableHead className="text-right">개통</TableHead>
                <TableHead className="text-right">성공률</TableHead>
                <TableHead className="text-right">개통률</TableHead>
                <TableHead className="min-w-[180px]">월 목표 달성</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-semibold">{u.name}</TableCell>
                  <TableCell className="text-right font-medium">{u.totalCalls}</TableCell>
                  <TableCell className="text-right text-success">{u.success}</TableCell>
                  <TableCell className="text-right text-destructive">{u.failed}</TableCell>
                  <TableCell className="text-right">{u.missed}</TableCell>
                  <TableCell className="text-right">{u.recall}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{u.activated}</TableCell>
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
