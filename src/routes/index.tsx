import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PhoneCall, TrendingUp, Award, CalendarIcon, Globe2, Inbox,
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
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_STATUSES, STATUS_CLASS, type CustomerStatus } from "@/lib/labels";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "대시보드 — Hanpass Mobile OB Call CRM" }] }),
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

const emptyDashboard = (): DashboardData => ({
  statusCounts: emptyStatus(),
  totals: { totalCalls: 0, totalCustomers: 0, monthlyTargetTotal: 0 },
  dailyData: [],
  channelData: [],
  countryData: [],
  ranking: [],
  callCompleted: 0,
});

function Dashboard() {
  const { t } = useTranslation();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState<Date>(monthStart);
  const [to, setTo] = useState<Date>(today);
  const [countryF, setCountryF] = useState<string>("all");

  const [countries, setCountries] = useState<{ id: string; code: string }[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard());
  const [loading, setLoading] = useState(true);
  const latestFetchRef = useRef(0);

  const { statusCounts, totals, dailyData, channelData, countryData, ranking, callCompleted: callCompletedFromRpc } = dashboard;

  // 국가 목록은 한 번만
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("countries").select("id, code").eq("is_active", true);
      setCountries(data ?? []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const requestId = ++latestFetchRef.current;
      setLoading(true);
      const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
      const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString();
      const Y = from.getFullYear(); const M = from.getMonth() + 1;
      const cId = countryF === "all" ? null : countryF;

      const { data, error } = await (supabase as any).rpc("stats_dashboard_summary", {
        _date_from: fromIso,
        _date_to: toIso,
        _year: Y,
        _month: M,
        _country_id: cId,
        _pool: null,
      });
      if (requestId !== latestFetchRef.current) return;
      if (error) { console.error("Dashboard stats failed", error); setLoading(false); return; }
      const summary = data ?? {};

      const sMap = emptyStatus();
      Object.entries((summary.status_counts ?? {}) as Record<string, unknown>).forEach(([status, cnt]) => {
        if (sMap[status as CustomerStatus] !== undefined) sMap[status as CustomerStatus] = Number(cnt ?? 0);
      });

      const ttRow = (summary.totals ?? {}) as any;
      const nextTotals = {
        totalCalls: Number(ttRow?.total_calls ?? 0),
        totalCustomers: Number(ttRow?.total_customers ?? 0),
        monthlyTargetTotal: Number(ttRow?.monthly_target_total ?? 0),
      };

      // 일별: RPC 결과를 모든 날짜에 채워넣기
      const dayMap = new Map<string, { calls: number; activations: number }>();
      for (const r of (summary.daily_calls ?? []) as any[]) {
        dayMap.set(String(r.day), { calls: Number(r.calls), activations: Number(r.activations) });
      }
      const days: DailyRow[] = [];
      const cur = new Date(from);
      while (cur <= to) {
        const key = cur.toISOString().slice(0, 10);
        const d = dayMap.get(key) ?? { calls: 0, activations: 0 };
        days.push({
          date: `${cur.getMonth() + 1}/${cur.getDate()}`,
          [t("dashboard.calls")]: d.calls,
          [t("dashboard.activations")]: d.activations,
        });
        cur.setDate(cur.getDate() + 1);
      }

      const cd = ((summary.country_activated ?? []) as any[]).map((r) => ({ name: r.code as string, value: Number(r.activated) }))
        .sort((a, b) => b.value - a.value).slice(0, 8);

      const chd = ((summary.channel_summary ?? []) as any[]).map((r) => ({
        name: String(r.name).replace("한패스 ", ""),
        [t("dashboard.customers")]: Number(r.customers),
        [t("dashboard.activations")]: Number(r.activations),
      }));

      const rkd = ((summary.staff_ranking ?? []) as any[]).map((r) => ({
        id: r.user_id, name: r.display_name,
        totalCalls: Number(r.total_calls), activated: Number(r.activated),
        target: Number(r.activation_target ?? 0),
      }));

      setDashboard({ statusCounts: sMap, totals: nextTotals, dailyData: days, countryData: cd, channelData: chd, ranking: rkd, callCompleted: Number(summary.call_completed ?? 0) });

      setLoading(false);
    })();
  }, [from, to, countryF, t]);

  const totalCustomers = totals.totalCustomers; void totalCustomers;
  const totalCalls = totals.totalCalls; void totalCalls;
  const activated = statusCounts.activated;
  // 콜 완료 = 콜 라운드 변경 기록 (날짜+고객 단위 distinct)
  const callCompleted = callCompletedFromRpc;
  const monthlyTargetTotal = totals.monthlyTargetTotal;
  void monthlyTargetTotal;

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboard.title")} description={loading ? t("common.loading") : t("dashboard.subtitle")} />

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

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] w-full" />
            ))}
          </div>
          <Skeleton className="h-[220px] w-full" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-[340px] w-full lg:col-span-2" />
            <Skeleton className="h-[340px] w-full" />
          </div>
          <Skeleton className="h-[340px] w-full" />
          <Skeleton className="h-[280px] w-full" />
        </div>
      ) : (
      <>
      {/* 핵심 지표: 미처리 / 콜 완료 / 개통 완료 / 개통 성공률 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link
          to="/customers"
          search={{ status: "new", country: countryF, from: from.toISOString(), to: to.toISOString(), pool: "all" }}
          className="block transition hover:scale-[1.01]"
        >
          <StatCard label={t("dashboard.notStarted")} value={statusCounts.new.toLocaleString()} icon={Inbox} tone="muted" />
        </Link>
        <Link
          to="/customers"
          search={{ status: "__call_completed__", country: countryF, from: from.toISOString(), to: to.toISOString(), pool: "all" }}
          className="block transition hover:scale-[1.01]"
        >
          <StatCard label={t("dashboard.callCompleted")} value={callCompleted.toLocaleString()} icon={PhoneCall} tone="primary" hint={t("dashboard.callCompletedHint")} />
        </Link>
        <Link
          to="/customers"
          search={{ status: "activated", country: countryF, from: from.toISOString(), to: to.toISOString(), pool: "all" }}
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

      {/* 상태별 카운트 (10종) */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.statusByCustomer")}</CardTitle>
          <CardDescription>{t("dashboard.statusDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {CUSTOMER_STATUSES.map((s) => (
              <Link
                key={s}
                to="/customers"
                search={{ status: s, country: countryF, from: from.toISOString(), to: to.toISOString(), pool: "all" }}
                className={`block rounded-lg border border-border/60 p-3 transition hover:scale-[1.02] hover:shadow-md ${STATUS_CLASS[s]}`}
              >
                <div className="text-xs font-medium opacity-80">{t(`status.${s}`)}</div>
                <div className="mt-1 text-2xl font-bold">{statusCounts[s].toLocaleString()}</div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("dashboard.dailyTrend")}</CardTitle><CardDescription>{format(from, "yyyy.MM.dd")} ~ {format(to, "yyyy.MM.dd")}</CardDescription></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                <Line type="monotone" dataKey={t("dashboard.calls")} stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey={t("dashboard.activations")} stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("dashboard.countryDist")}</CardTitle><CardDescription>{t("dashboard.countryDistDesc")}</CardDescription></CardHeader>
          <CardContent className="h-[280px]">
            {countryData.every((c) => c.value === 0) ? (
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("dashboard.staffRanking")}</CardTitle><CardDescription>{t("dashboard.staffRankingDesc")}</CardDescription></CardHeader>
        <CardContent>
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
