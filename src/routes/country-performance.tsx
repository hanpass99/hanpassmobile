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

export const Route = createFileRoute("/country-performance")({
  head: () => ({ meta: [{ title: "국가별 성과 — Hanpass OB CRM" }] }),
  component: CountryPerf,
});

type Counts = Record<CustomerStatus, number>;
type Row = { code: string; name: string; total: number; counts: Counts };

const emptyCounts = (): Counts => Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Counts;

function CountryPerf() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [co, cu] = await Promise.all([
        supabase.from("countries").select("id, code, name_ko").eq("is_active", true),
        supabase.from("customers").select("country_id, status"),
      ]);
      const out: Row[] = (co.data ?? []).map((c) => {
        const counts = emptyCounts();
        let total = 0;
        for (const x of cu.data ?? []) {
          if (x.country_id !== c.id) continue;
          const s = x.status as CustomerStatus;
          if (counts[s] !== undefined) counts[s]++;
          total++;
        }
        return { code: c.code, name: c.name_ko, total, counts };
      }).sort((a, b) => b.counts.activated - a.counts.activated);
      setRows(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title="국가별 성과" description={loading ? "로드 중..." : "국가별 고객 상태 통계"} />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>국가</TableHead>
                <TableHead className="text-right">전체 콜수</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{STATUS_LABEL[s]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.code}>
                  <TableCell>
                    <span className="font-mono text-xs font-bold text-primary">{c.code}</span>
                    <span className="ml-2 text-sm">{c.name}</span>
                  </TableCell>
                  <TableCell className="text-right font-bold">{c.total}</TableCell>
                  {CUSTOMER_STATUSES.map((s) => (
                    <TableCell key={s} className={cn(
                      "text-right",
                      s === "activated" && "font-bold text-primary",
                    )}>{c.counts[s]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
