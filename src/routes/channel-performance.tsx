import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
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
type CustRow = { channel_id: string | null; status: CustomerStatus; imported_at: string };

const emptyCounts = (): Counts => Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Counts;

function ChannelPerf() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<CustRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const load = async () => {
    setLoading(true);
    const [ch, cu] = await Promise.all([
      supabase.from("channels").select("id, name").eq("is_active", true),
      supabase.from("customers").select("channel_id, status, imported_at"),
    ]);
    setChannels(ch.data ?? []);
    setCustomers((cu.data ?? []) as CustRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const c = supabase
      .channel("channel-perf-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(c); };
  }, []);

  const rows = useMemo<Row[]>(() => {
    const fromTs = dateFrom ? new Date(new Date(dateFrom).setHours(0,0,0,0)).getTime() : null;
    const toTs = dateTo ? new Date(new Date(dateTo).setHours(23,59,59,999)).getTime() : null;
    const filtered = customers.filter((x) => {
      const ts = new Date(x.imported_at).getTime();
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
      return true;
    });
    const out: Row[] = channels.map((c) => {
      const counts = emptyCounts();
      let total = 0;
      for (const x of filtered) {
        if (x.channel_id !== c.id) continue;
        const s = x.status as CustomerStatus;
        if (counts[s] !== undefined) counts[s]++;
        total++;
      }
      return { id: c.id, name: c.name, total, counts };
    });
    out.sort((a, b) => b.counts.activated - a.counts.activated || b.total - a.total);
    return out;
  }, [channels, customers, dateFrom, dateTo]);

  return (
    <div className="space-y-5">
      <PageHeader title={t("channelPerf.title")} description={loading ? t("common.loading") : t("channelPerf.subtitle")} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <DateBtn value={dateFrom} onChange={setDateFrom} placeholder={t("common.from") || "시작일"} />
          <span className="text-muted-foreground">~</span>
          <DateBtn value={dateTo} onChange={setDateTo} placeholder={t("common.to") || "종료일"} />
          {(dateFrom || dateTo) && (
            <Button size="sm" variant="ghost" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="mr-1 h-3.5 w-3.5" /> {t("common.reset") || "초기화"}
            </Button>
          )}
        </CardContent>
      </Card>

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

function DateBtn({ value, onChange, placeholder }: { value?: Date; onChange: (d?: Date) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9", !value && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? format(value, "yyyy-MM-dd") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
