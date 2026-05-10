import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/lib/labels";

export const Route = createFileRoute("/channel-performance")({
  head: () => ({ meta: [{ title: "채널별 성과 — Hanpass OB CRM" }] }),
  component: ChannelPerf,
});

type Counts = Record<CustomerStatus, number>;
type Row = { id: string; name: string; total: number; counts: Counts };

const emptyCounts = (): Counts => Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Counts;

function ChannelPerf() {
  const { t } = useTranslation();
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
      });
      out.sort((a, b) => b.counts.activated - a.counts.activated || b.total - a.total);
      setRows(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title={t("channelPerf.title")} description={loading ? t("common.loading") : t("channelPerf.subtitle")} />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t("channelPerf.channel")}</TableHead>
                <TableHead className="text-right">{t("dashboard.totalCalls")}</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{t(`status.${s}`)}</TableHead>
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
                <TableRow><TableCell colSpan={2 + CUSTOMER_STATUSES.length} className="text-center py-8 text-sm text-muted-foreground">{t("channelPerf.noChannel")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
