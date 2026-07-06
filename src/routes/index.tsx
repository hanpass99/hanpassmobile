import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PhoneCall, TrendingUp, Award, CalendarIcon, Globe2, Inbox, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { dateKey, dayEndIso, dayStartIso } from "@/lib/date-range";
import { CUSTOMER_STATUSES, STATUS_CLASS, type CustomerStatus } from "@/lib/labels";
import { useDashboardCountries, useDashboardSummary, type DashboardSummary } from "@/hooks/use-dashboard";
import { supabase } from "@/integrations/supabase/client";
import { useSlaViolationCount } from "@/hooks/use-sla";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "대시보드 — Hanpass Mobile OB Call CRM" }] }),
  loader: ({ context: { queryClient } }) => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    queryClient.prefetchQuery({
      queryKey: ["dashboard", "countries"],
      staleTime: Infinity,
      queryFn: async () => {
        const { data } = await supabase.from("countries").select("id, code").eq("is_active", true);
        return data ?? [];
      },
    });
  },
  component: Dashboard,
});

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

type StatusCounts = Record<CustomerStatus, number>;
type DailyRow = { date: string; [k: string]: string | number };
type ChannelRow = { name: string; [k: string]: string | number };
type CountryRow = { name: string; value: number };
type RankRow = { id: string; name: string; totalCalls: number; activated: number; target: number };
type DashboardData = {
  statusCounts: StatusCounts;
  totals: { totalCalls: number; totalCustomers: number; monthlyTargetTotal: number };
  dailyData: DailyRow[];
  channelData: ChannelRow[];
  countryData: CountryRow[];
  ranking: RankRow[];
  callCompleted: number;
};

const emptyStatus = (): StatusCounts => ({
  new: 0, in_progress: 0, no_answer: 0, not_interested: 0, callback: 0,
  activated: 0, stay_expired: 0, delinquent: 0, line_exceeded: 0, minor: 0,
  wrong_application: 0, seasonal_worker: 0, suspended_number: 0,
});


function Dashboard() {
  const { t } = useTranslation();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState<Date>(monthStart);
  const [to, setTo] = useState<Date>(today);
  const [countryF, setCountryF] = useState<string>("all");

  const { data: countries = [] } = useDashboardCountries();
  const summaryQ = useDashboardSummary({
    from, to, countryId: countryF === "all" ? null : countryF,
  });
  const loading = summaryQ.isLoading;
  const isError = summaryQ.isError;

  const dashboard = useMemo<DashboardData>(() => {
    const summary: DashboardSummary = summaryQ.data ?? {};
    const sMap = emptyStatus();
    Object.entries(summary.status_counts ?? {}).forEach(([status, cnt]) => {
      if (sMap[status as CustomerStatus] !== undefined) sMap[status as CustomerStatus] = Number(cnt ?? 0);
    });

    const ttRow = summary.totals ?? {};
    const nextTotals = {
      totalCalls: Number(ttRow.total_calls ?? 0),
      totalCustomers: Number(ttRow.total_customers ?? 0),
      monthlyTargetTotal: Number(ttRow.monthly_target_total ?? 0),
    };

    const dayMap = new Map<string, { calls: number; activations: number }>();
    for (const r of summary.daily_calls ?? []) {
      dayMap.set(String(r.day), { calls: Number(r.calls), activations: Number(r.activations) });
    }
    const days: DailyRow[] = [];
    const today = new Date();
    const cur = new Date(from);
    while (cur <= to) {
      if (cur > today) break;
      const key = dateKey(cur);
      const d = dayMap.get(key) ?? { calls: 0, activations: 0 };
      days.push({
        date: `${cur.getMonth() + 1}/${cur.getDate()}`,
        [t("dashboard.calls")]: d.calls,
        [t("dashboard.activations")]: d.activations,
      });
      cur.setDate(cur.getDate() + 1);
    }

    const cd = (summary.country_activated ?? []).map((r) => ({ name: r.code, value: Number(r.activated) }))
      .sort((a, b) => b.value - a.value).slice(0, 8);

    const chd = (summary.channel_summary ?? []).map((r) => ({
      name: String(r.name).replace("한패스 ", ""),
      [t("dashboard.customers")]: Number(r.customers),
      [t("dashboard.activations")]: Number(r.activations),
    }));

    const rkd = (summary.staff_ranking ?? []).map((r) => ({
      id: r.user_id, name: r.display_name,
      totalCalls: Number(r.total_calls), activated: Number(r.activated),
      target: Number(r.activation_target ?? 0),
    }));

    return {
      statusCounts: sMap,
      totals: nextTotals,
      dailyData: days,
      countryData: cd,
      channelData: chd,
      ranking: rkd,
      callCompleted: Number(summary.call_completed ?? 0),
    };
  }, [summaryQ.data, from, to, t]);

  const { statusCounts, totals, dailyData, channelData, countryData, ranking, callCompleted: callCompletedFromRpc } = dashboard;


  const totalCustomers = totals.totalCustomers; void totalCustomers;
  const totalCalls = totals.totalCalls; void totalCalls;
  const activated = statusCounts.activated;
  // 콜 완료 = 미처리 제외 전체 상태 합산 (모든 성과 화면에서 동일 계산)
  const callCompleted = Object.entries(statusCounts).reduce(
    (sum, [s, n]) => (s === "new" ? sum : sum + (Number(n) || 0)),
    0,
  );
  const monthlyTargetTotal = totals.monthlyTargetTotal;
  void monthlyTargetTotal;

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboard.title")} description={loading ? t("common.loading") : `${t("dashboard.subtitle")} · ${format(from, "MM.dd")} ~ ${format(to, "MM.dd")} 기준`} />

      {isError && (
        <Card role="alert">
          <CardContent className="space-y-3 p-6 text-center">
            <div className="text-sm font-semibold">대시보드 데이터를 불러오지 못했습니다</div>
            <div className="text-xs text-muted-foreground">{(summaryQ.error as Error)?.message}</div>
            <Button onClick={() => void summaryQ.refetch()} size="sm" aria-busy={summaryQ.isFetching}>
              다시 시도
            </Button>
          </CardContent>
        </Card>
      )}


      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("common.startDate")}</div>
            <DatePick value={from} onChange={setFrom} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("common.endDate")}</div>
            <DatePick value={to} onChange={setTo} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("dashboard.countryFilter")}</div>
            <Select value={countryF} onValueChange={setCountryF}>
              <SelectTrigger className="w-[180px]">
                <Globe2 className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.allCountries")}</SelectItem>
                {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setFrom(monthStart); setTo(today); setCountryF("all"); }}>
              {t("common.reset")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 핵심 지표: 미처리 / 콜 완료 / 개통 완료 / 개통 성공률 */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] w-full" />
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link
          to="/customers"
          search={{ status: "new", country: countryF, from: dayStartIso(from), to: dayEndIso(to), pool: "all" }}
          className="block transition hover:scale-[1.01]"
        >
          <StatCard label={t("dashboard.notStarted")} value={statusCounts.new.toLocaleString()} icon={Inbox} tone="muted" />
        </Link>
        <Link
          to="/customers"
          search={{ status: "__call_completed__", country: countryF, from: dayStartIso(from), to: dayEndIso(to), pool: "all" }}
          className="block transition hover:scale-[1.01]"
        >
          <StatCard label={t("dashboard.callCompleted")} value={callCompleted.toLocaleString()} icon={PhoneCall} tone="primary" hint={t("dashboard.callCompletedHint")} />
        </Link>
        <Link
          to="/customers"
          search={{ status: "activated", country: countryF, from: dayStartIso(from), to: dayEndIso(to), pool: "all" }}
          className="block transition hover:scale-[1.01]"
        >
          <StatCard label={t("dashboard.activated")} value={activated.toLocaleString()} icon={Award} tone="success" />
        </Link>
        <StatCard
          label={t("dashboard.activationSuccessRate")}
          value={(callCompleted ? (activated / callCompleted) * 100 : 0).toFixed(1)}
          suffix="%"
          icon={TrendingUp}
          tone="info"
          hint={t("dashboard.activationSuccessHint") + ` (${activated}/${callCompleted})`}
        />
      </div>
      )}


      {/* 상태별 카운트 (10종) */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.statusByCustomer")}</CardTitle>
          <CardDescription>{t("dashboard.statusDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-[68px] w-full" />
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {CUSTOMER_STATUSES.map((s) => (
              <Link
                key={s}
                to="/customers"
                search={{ status: s, country: countryF, from: dayStartIso(from), to: dayEndIso(to), pool: "all" }}
                className={`block rounded-lg border border-border/60 p-3 transition hover:scale-[1.02] hover:shadow-md ${STATUS_CLASS[s]}`}
              >
                <div className="text-xs font-medium opacity-80">{t(`status.${s}`)}</div>
                <div className="mt-1 text-2xl font-bold">{statusCounts[s].toLocaleString()}</div>
              </Link>
            ))}
          </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("dashboard.dailyTrend")}</CardTitle><CardDescription>{format(from, "yyyy.MM.dd")} ~ {format(to, "yyyy.MM.dd")}</CardDescription></CardHeader>
          <CardContent className="h-[280px]">
            {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                <Line type="monotone" dataKey={t("dashboard.calls")} stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey={t("dashboard.activations")} stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("dashboard.countryDist")}</CardTitle><CardDescription>{t("dashboard.countryDistDesc")}</CardDescription></CardHeader>
          <CardContent className="h-[280px]">
            {loading ? <Skeleton className="h-full w-full" /> : countryData.every((c) => c.value === 0) ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("common.empty")}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={countryData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                    {countryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("dashboard.channelPerf")}</CardTitle><CardDescription>{t("dashboard.channelPerfDesc")}</CardDescription></CardHeader>
        <CardContent className="h-[280px]">
          {loading ? <Skeleton className="h-full w-full" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channelData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={140} />
              <Tooltip /><Legend />
              <Bar dataKey={t("dashboard.customers")} fill="#3b82f6" radius={[0, 6, 6, 0]} />
              <Bar dataKey={t("dashboard.activations")} fill="#10b981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("dashboard.staffRanking")}</CardTitle><CardDescription>{t("dashboard.staffRankingDesc")}</CardDescription></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[68px] w-full" />
              ))}
            </div>
          ) : (
          <div className="space-y-3">
            {ranking.map((u, i) => {
              const pct = u.target ? (u.activated / u.target) * 100 : 0;
              return (
                <div key={u.id} className="flex items-center gap-4 rounded-lg border border-border/60 p-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                    i === 0 ? "bg-warning/20 text-warning-foreground" :
                    i === 1 ? "bg-muted text-foreground" :
                    i === 2 ? "bg-destructive/15 text-destructive" :
                    "bg-secondary text-secondary-foreground"
                  }`}>{i + 1}</div>
                  <div className="min-w-[120px] flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{u.name}</span>
                      <span className="text-xs text-muted-foreground">{t("dashboard.activations")} {u.activated} / {u.target || "—"} {u.target ? `(${pct.toFixed(0)}%)` : ""}</span>
                    </div>
                    <Progress value={Math.min(100, pct)} className="mt-2 h-2" />
                  </div>
                  <div className="hidden gap-6 text-xs sm:flex">
                    <div><div className="text-muted-foreground">{t("dashboard.calls")}</div><div className="font-semibold">{u.totalCalls}</div></div>
                  </div>
                </div>
              );
            })}
            {!ranking.length && <div className="text-center text-sm text-muted-foreground py-6">{t("dashboard.noStaff")}</div>}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DatePick({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "yyyy.MM.dd") : <span>선택</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
