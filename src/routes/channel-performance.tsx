import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CHANNELS, CUSTOMERS, computeStats } from "@/lib/mock-data";

export const Route = createFileRoute("/channel-performance")({
  head: () => ({ meta: [{ title: "채널별 성과 — Hanpass OB CRM" }] }),
  component: ChannelPerf,
});

function ChannelPerf() {
  const rows = CHANNELS.map((ch) => {
    const subset = CUSTOMERS.filter((c) => c.channel === ch);
    const cs = computeStats(subset);
    const pending = subset.filter((c) => c.status === "미처리" || c.status === "처리중").length;
    return { name: ch, total: subset.length, pending, ...cs };
  });

  return (
    <div className="space-y-5">
      <PageHeader title="채널별 성과" description="유입 채널별 콜 효율 분석" />

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.name}>
            <CardHeader>
              <CardTitle className="text-base">{r.name}</CardTitle>
              <CardDescription>총 고객 {r.total}명 · 미처리 {r.pending}명</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">콜수</div>
                  <div className="mt-1 text-xl font-bold">{r.totalCalls}</div>
                </div>
                <div className="rounded-lg bg-success/10 p-3">
                  <div className="text-xs text-muted-foreground">성공률</div>
                  <div className="mt-1 text-xl font-bold text-success">{r.successRate.toFixed(1)}%</div>
                </div>
                <div className="rounded-lg bg-primary-soft p-3">
                  <div className="text-xs text-muted-foreground">개통률</div>
                  <div className="mt-1 text-xl font-bold text-primary">{r.activationRate.toFixed(1)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>채널명</TableHead>
                <TableHead className="text-right">총 고객</TableHead>
                <TableHead className="text-right">총 콜수</TableHead>
                <TableHead className="text-right">성공 콜</TableHead>
                <TableHead className="text-right">개통 완료</TableHead>
                <TableHead className="text-right">성공률</TableHead>
                <TableHead className="text-right">개통률</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.total}</TableCell>
                  <TableCell className="text-right">{r.totalCalls}</TableCell>
                  <TableCell className="text-right text-success">{r.success}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{r.activated}</TableCell>
                  <TableCell className="text-right">{r.successRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{r.activationRate.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
