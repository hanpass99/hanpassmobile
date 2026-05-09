import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/channel-performance")({
  head: () => ({ meta: [{ title: "채널별 성과 — Hanpass OB CRM" }] }),
  component: ChannelPerf,
});

type Row = {
  id: string; name: string; total: number; pending: number;
  totalCalls: number; success: number; activated: number; successRate: number; activationRate: number;
};

function ChannelPerf() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [ch, cu, lg] = await Promise.all([
        supabase.from("channels").select("id, name").eq("is_active", true),
        supabase.from("customers").select("id, channel_id, status"),
        supabase.from("call_logs").select("customer_id, result, is_activation"),
      ]);
      const out: Row[] = (ch.data ?? []).map((c) => {
        const subset = (cu.data ?? []).filter((x) => x.channel_id === c.id);
        const ids = new Set(subset.map((x) => x.id));
        const cl = (lg.data ?? []).filter((l) => ids.has(l.customer_id));
        const total = subset.length;
        const pending = subset.filter((x) => x.status === "new" || x.status === "in_progress").length;
        const totalCalls = cl.length;
        const success = cl.filter((l) => l.result === "interested" || l.result === "activated").length;
        const activated = cl.filter((l) => l.is_activation).length;
        return {
          id: c.id, name: c.name, total, pending, totalCalls, success, activated,
          successRate: totalCalls ? (success / totalCalls) * 100 : 0,
          activationRate: totalCalls ? (activated / totalCalls) * 100 : 0,
        };
      });
      setRows(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title="채널별 성과" description={loading ? "로드 중..." : "유입 채널별 콜 효율 분석"} />

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.id}>
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
                <TableRow key={r.id}>
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
