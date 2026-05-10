import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_STATUSES, STATUS_LABEL, type CustomerStatus } from "@/lib/labels";

export const Route = createFileRoute("/channel-performance")({
  head: () => ({ meta: [{ title: "채널별 성과 — Hanpass OB CRM" }] }),
  component: ChannelPerf,
});

type Counts = Record<CustomerStatus, number>;
type Row = { id: string; name: string; total: number; counts: Counts };

const emptyCounts = (): Counts => Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Counts;

function ChannelPerf() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [ch, cu] = await Promise.all([
        supabase.from("channels").select("id, name").eq("is_active", true),
        supabase.from("customers").select("channel_id, status"),
      ]);
      const out: Row[] = (ch.data ?? []).map((c) => {
        const counts = emptyCounts();
        let total = 0;
        for (const x of cu.data ?? []) {
          if (x.channel_id !== c.id) continue;
          const s = x.status as CustomerStatus;
          if (counts[s] !== undefined) counts[s]++;
          total++;
        }
        return { id: c.id, name: c.name, total, counts };
      }).sort((a, b) => b.counts.activated - a.counts.activated);
      setRows(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title="채널별 성과" description={loading ? "로드 중..." : "유입 채널별 고객 상태 통계"} />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>채널명</TableHead>
                <TableHead className="text-right">전체 콜수</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{STATUS_LABEL[s]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                  <TableCell className="text-right font-bold">{r.total}</TableCell>
                  {CUSTOMER_STATUSES.map((s) => (
                    <TableCell key={s} className={cn(
                      "text-right",
                      s === "activated" && "font-bold text-primary",
                    )}>{r.counts[s]}</TableCell>
                  ))}
                </TableRow>
              ))}
              {!rows.length && !loading && (
                <TableRow><TableCell colSpan={2 + CUSTOMER_STATUSES.length} className="text-center py-8 text-sm text-muted-foreground">채널이 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
