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

export const Route = createFileRoute("/country-performance")({
  head: () => ({ meta: [{ title: "국가별 성과 — Hanpass OB CRM" }] }),
  component: CountryPerf,
});

type Counts = Record<CustomerStatus, number>;
type Row = { code: string; name: string; total: number; counts: Counts };

const emptyCounts = (): Counts => Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Counts;

function CountryPerf() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const load = async () => {
    setLoading(true);
    const args: { _date_from?: string; _date_to?: string } = {};
    if (dateFrom) args._date_from = new Date(new Date(dateFrom).setHours(0,0,0,0)).toISOString();
    if (dateTo) args._date_to = new Date(new Date(dateTo).setHours(23,59,59,999)).toISOString();
    const { data, error } = await supabase.rpc("stats_by_country", args);
    if (!error) {
      const out: Row[] = (data ?? []).map((r: any) => {
        const counts = emptyCounts();
        const sc = (r.status_counts ?? {}) as Record<string, number>;
        for (const s of CUSTOMER_STATUSES) counts[s] = Number(sc[s] ?? 0);
        return { code: r.code, name: r.name_ko, total: Number(r.total ?? 0), counts };
      }).sort((a, b) => b.counts.activated - a.counts.activated);
      setRows(out);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  useEffect(() => {
    const c = supabase
      .channel("country-perf-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(c); };
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title={t("countryPerf.title")} description={loading ? t("common.loading") : t("countryPerf.subtitle")} />
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
                <TableHead>{t("countryPerf.country")}</TableHead>
                <TableHead className="text-right">{t("dashboard.totalCalls")}</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{t(`status.${s}`)}</TableHead>
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
