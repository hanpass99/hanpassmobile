import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/country-performance")({
  head: () => ({ meta: [{ title: "국가별 성과 — Hanpass OB CRM" }] }),
  component: CountryPerf,
});

type Row = {
  code: string; name: string;
  totalCalls: number; success: number; failed: number; missed: number; activated: number;
  successRate: number; activationRate: number;
};

function CountryPerf() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [co, cu, lg] = await Promise.all([
        supabase.from("countries").select("id, code, name_ko").eq("is_active", true),
        supabase.from("customers").select("id, country_id"),
        supabase.from("call_logs").select("customer_id, result, is_activation"),
      ]);
      const out: Row[] = (co.data ?? []).map((c) => {
        const ids = new Set((cu.data ?? []).filter((x) => x.country_id === c.id).map((x) => x.id));
        const cl = (lg.data ?? []).filter((l) => ids.has(l.customer_id));
        const totalCalls = cl.length;
        const success = cl.filter((l) => l.result === "interested" || l.result === "activated").length;
        const failed = cl.filter((l) => l.result === "failed" || l.result === "wrong_number").length;
        const missed = cl.filter((l) => l.result === "no_answer").length;
        const activated = cl.filter((l) => l.is_activation).length;
        return {
          code: c.code, name: c.name_ko,
          totalCalls, success, failed, missed, activated,
          successRate: totalCalls ? (success / totalCalls) * 100 : 0,
          activationRate: totalCalls ? (activated / totalCalls) * 100 : 0,
        };
      }).sort((a, b) => b.activated - a.activated);
      setRows(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title="국가별 성과" description={loading ? "로드 중..." : "국가별 콜 및 개통 실적"} />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>국가</TableHead>
                <TableHead className="text-right">전체 콜</TableHead>
                <TableHead className="text-right">성공</TableHead>
                <TableHead className="text-right">실패</TableHead>
                <TableHead className="text-right">부재중</TableHead>
                <TableHead className="text-right">개통 완료</TableHead>
                <TableHead className="text-right">성공률</TableHead>
                <TableHead className="text-right">개통률</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.code}>
                  <TableCell>
                    <span className="font-mono text-xs font-bold text-primary">{c.code}</span>
                    <span className="ml-2 text-sm">{c.name}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">{c.totalCalls}</TableCell>
                  <TableCell className="text-right text-success">{c.success}</TableCell>
                  <TableCell className="text-right text-destructive">{c.failed}</TableCell>
                  <TableCell className="text-right">{c.missed}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{c.activated}</TableCell>
                  <TableCell className="text-right">{c.successRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{c.activationRate.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
