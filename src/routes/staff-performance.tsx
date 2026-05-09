import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CUSTOMERS, STAFF, computeStats } from "@/lib/mock-data";

export const Route = createFileRoute("/staff-performance")({
  head: () => ({ meta: [{ title: "직원 성과 — Hanpass OB CRM" }] }),
  component: StaffPerf,
});

function StaffPerf() {
  const rows = STAFF.filter((s) => s.role === "staff").map((u) => {
    const cs = computeStats(CUSTOMERS.filter((c) => c.assignedStaffId === u.id));
    const achievement = (cs.activated / u.monthlyTarget) * 100;
    return { ...u, ...cs, achievement };
  }).sort((a, b) => b.achievement - a.achievement);

  return (
    <div className="space-y-5">
      <PageHeader title="직원 성과" description="이번 달 직원별 콜 및 개통 실적" />

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
                  <TableCell>
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
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
                        {u.activated}/{u.monthlyTarget} ({u.achievement.toFixed(0)}%)
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
