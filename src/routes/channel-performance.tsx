import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, X, Users, CheckCircle2, TrendingUp, PhoneCall } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { dayEndIso, dayStartIso } from "@/lib/date-range";
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/lib/labels";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

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
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showEmpty, setShowEmpty] = useState(false);
  const latestLoadRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    const requestId = ++latestLoadRef.current;
    setLoading(true);
    const args: { _date_from?: string; _date_to?: string } = {};
    if (dateFrom) args._date_from = dayStartIso(dateFrom);
    if (dateTo) args._date_to = dayEndIso(dateTo);
    const { data, error } = await supabase.rpc("stats_by_channel", args);
    if (requestId !== latestLoadRef.current) return;
    if (!error) {
      const out: Row[] = (data ?? []).map((r: any) => {
        const counts = emptyCounts();
        const sc = (r.status_counts ?? {}) as Record<string, number>;
        for (const s of CUSTOMER_STATUSES) counts[s] = Number(sc[s] ?? 0);
        return { id: r.channel_id, name: r.name, total: Number(r.total ?? 0), counts };
      }).sort((a, b) => b.counts.activated - a.counts.activated || b.total - a.total);
      setRows(out);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  useEffect(() => {
    const c = supabase
      .channel("channel-perf-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => {
        if (refreshTimerRef.current) return;
        refreshTimerRef.current = setTimeout(() => {
          refreshTimerRef.current = null;
          void load();
        }, 1500);
      })
      .subscribe();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(c);
    };
  }, [dateFrom, dateTo]);

  const visibleRows = useMemo(
    () => (showEmpty ? rows : rows.filter((r) => r.total > 0)),
    [rows, showEmpty],
  );

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total, 0);
    const activated = rows.reduce((s, r) => s + r.counts.activated, 0);
    const callCompleted = rows.reduce((s, r) => s + (r.total - r.counts.new), 0);
    const rate = callCompleted > 0 ? (activated / callCompleted) * 100 : 0;
    return { total, activated, callCompleted, rate };
  }, [rows]);

  const chartData = useMemo(
    () => rows.filter((r) => r.total > 0).map((r) => ({
      name: r.name,
      total: r.total,
      activated: r.counts.activated,
    })),
    [rows],
  );

  const rateBadge = (total: number, rate: number) => {
    if (total === 0) return <Badge variant="secondary">—</Badge>;
    if (rate >= 3) return <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">{rate.toFixed(1)}%</Badge>;
    if (rate >= 1) return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">{rate.toFixed(1)}%</Badge>;
    return <Badge className="bg-red-500 hover:bg-red-500 text-white">{rate.toFixed(1)}%</Badge>;
  };

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
          <label className="ml-auto flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox checked={showEmpty} onCheckedChange={(v) => setShowEmpty(v === true)} />
            빈 채널 표시
          </label>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="전체 고객" value={totals.total.toLocaleString()} icon={Users} tone="muted" />
        <StatCard label="콜 완료" value={totals.callCompleted.toLocaleString()} icon={PhoneCall} tone="info" />
        <StatCard label="개통 성공" value={totals.activated.toLocaleString()} icon={CheckCircle2} tone="primary" />
        <StatCard label="전체 개통 성공률" value={`${totals.rate.toFixed(1)}%`} icon={TrendingUp} tone="success" />
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">채널별 고객 수 / 개통 성공</div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name="고객 수" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="activated" name="개통 성공" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t("channelPerf.channel")}</TableHead>
                <TableHead className="text-right">{t("dashboard.totalCalls")}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t("dashboard.callCompleted")}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t("dashboard.activationSuccessRate")}</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{t(`status.${s}`)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r) => {
                const callCompleted = r.total - r.counts.new;
                const rate = callCompleted > 0 ? (r.counts.activated / callCompleted) * 100 : 0;
                return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                  <TableCell className="text-right font-bold">{r.total}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{callCompleted}</TableCell>
                  <TableCell className="text-right">{rateBadge(r.total, rate)}</TableCell>
                  {CUSTOMER_STATUSES.map((s) => (
                    <TableCell key={s} className={cn(
                      "text-right",
                      s === "activated" && "font-bold text-primary",
                    )}>{r.counts[s]}</TableCell>
                  ))}
                </TableRow>
                );
              })}
              {!visibleRows.length && !loading && (
                <TableRow><TableCell colSpan={4 + CUSTOMER_STATUSES.length} className="text-center py-8 text-sm text-muted-foreground">{t("channelPerf.noChannel")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-bold", accent)}>{value}</span>
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
