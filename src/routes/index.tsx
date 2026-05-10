import { createFileRoute } from "@tanstack/react-router";
import {
  PhoneCall, CheckCircle2, TrendingUp, Target, Award, CalendarIcon, Globe2,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_STATUSES, STATUS_CLASS, type CustomerStatus, type CallResult } from "@/lib/labels";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "대시보드 — Hanpass Mobile OB Call CRM" }] }),
  component: Dashboard,
});

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

type CallLog = { call_date: string; result: CallResult; is_activation: boolean; staff_id: string; customer_id: string };
type Customer = {
  id: string; status: CustomerStatus; country_id: string | null; channel_id: string | null;
  assigned_to: string | null; updated_at: string; created_at: string; imported_at: string;
};

function Dashboard() {
  const { t } = useTranslation();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState<Date>(monthStart);
  const [to, setTo] = useState<Date>(today);
  const [countryF, setCountryF] = useState<string>("all");

  const [logs, setLogs] = useState<CallLog[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [countries, setCountries] = useState<{ id: string; code: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<{ id: string; display_name: string }[]>([]);
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<{ user_id: string; activation_target: number; call_target: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
      const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString();
      const Y = from.getFullYear(); const M = from.getMonth() + 1;
      const [l, c, co, ch, sf, t, ur] = await Promise.all([
        supabase.from("call_logs").select("call_date, result, is_activation, staff_id, customer_id").gte("call_date", fromIso).lte("call_date", toIso),
        supabase.from("customers").select("id, status, country_id, channel_id, assigned_to, updated_at, created_at, imported_at").limit(5000),
        supabase.from("countries").select("id, code").eq("is_active", true),
        supabase.from("channels").select("id, name").eq("is_active", true),
        supabase.from("profiles").select("id, display_name").eq("is_active", true),
        supabase.from("targets").select("user_id, activation_target, call_target").eq("year", Y).eq("month", M),
        supabase.from("user_roles").select("user_id, role").eq("role", "staff"),
      ]);
      setLogs((l.data ?? []) as CallLog[]);
      setCustomers((c.data ?? []) as Customer[]);
      setCountries(co.data ?? []);
      setChannels(ch.data ?? []);
      setStaff(sf.data ?? []);
      setStaffIds(new Set((ur.data ?? []).map((r: any) => r.user_id)));
      setTargets(t.data ?? []);
      setLoading(false);
    })();
  }, [from, to]);

  // 국가 필터 적용 — 고객은 country로, 콜로그는 customer 매핑으로
  const customerById = useMemo(() => {
    const m = new Map<string, Customer>();
    customers.forEach((c) => m.set(c.id, c));
    return m;
  }, [customers]);

  const fCustomers = useMemo(() => {
    return customers.filter((c) => countryF === "all" || c.country_id === countryF);
  }, [customers, countryF]);

  const fLogs = useMemo(() => {
    if (countryF === "all") return logs;
    return logs.filter((l) => customerById.get(l.customer_id)?.country_id === countryF);
  }, [logs, countryF, customerById]);

  // 상태별 카운트 (고객 기준)
  const statusCounts = useMemo(() => {
    const m: Record<CustomerStatus, number> = {
      new: 0, in_progress: 0, no_answer: 0, not_interested: 0, callback: 0,
      activated: 0, stay_expired: 0, delinquent: 0, line_exceeded: 0, minor: 0,
    };
    fCustomers.forEach((c) => { m[c.status] = (m[c.status] ?? 0) + 1; });
    return m;
  }, [fCustomers]);

  const totalCustomers = fCustomers.length;
  const totalCalls = fLogs.length;
  const activated = statusCounts.activated;
  // 성공 = 개통완료 + 진행중 + 재연락요청
  const success = statusCounts.activated + statusCounts.in_progress + statusCounts.callback;
  const successRate = totalCustomers ? (success / totalCustomers) * 100 : 0;
  const activationRate = totalCustomers ? (activated / totalCustomers) * 100 : 0;
  const monthlyTargetTotal = targets.reduce((a, b) => a + (b.activation_target || 0), 0);
  const achievement = monthlyTargetTotal ? (activated / monthlyTargetTotal) * 100 : 0;

  // 일별 추이 (콜수 + 개통)
  const dailyData = useMemo(() => {
    const days: { date: string; key: string }[] = [];
    const cur = new Date(from);
    while (cur <= to) {
      days.push({ date: `${cur.getMonth() + 1}/${cur.getDate()}`, key: cur.toISOString().slice(0, 10) });
      cur.setDate(cur.getDate() + 1);
    }
    return days.map((d) => {
      const day = fLogs.filter((l) => l.call_date.slice(0, 10) === d.key);
      return {
        date: d.date,
        [t("dashboard.calls")]: day.length,
        [t("dashboard.activations")]: day.filter((l) => l.is_activation).length,
      };
    });
  }, [fLogs, from, to, t]);

  const channelData = channels.map((ch) => {
    const list = fCustomers.filter((c) => c.channel_id === ch.id);
    return {
      name: ch.name.replace("한패스 ", ""),
      [t("dashboard.customers")]: list.length,
      [t("dashboard.activations")]: list.filter((c) => c.status === "activated").length,
    };
  });

  const countryData = countries.map((co) => ({
    name: co.code,
    value: customers.filter((c) => c.country_id === co.id && c.status === "activated").length,
  })).sort((a, b) => b.value - a.value).slice(0, 8);

  // 직원 랭킹 — 관리자 제외
  const ranking = staff
    .filter((u) => staffIds.has(u.id))
    .map((u) => {
      const userLogs = fLogs.filter((l) => l.staff_id === u.id);
      const userCustomers = fCustomers.filter((c) => c.assigned_to === u.id);
      const tg = targets.find((x) => x.user_id === u.id);
      const userActivated = userCustomers.filter((c) => c.status === "activated").length;
      return {
        id: u.id, name: u.display_name,
        totalCalls: userLogs.length,
        activated: userActivated,
        target: tg?.activation_target ?? 0,
      };
    })
    .sort((a, b) => b.activated - a.activated || b.totalCalls - a.totalCalls);

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

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label={t("dashboard.totalCalls")} value={totalCalls.toLocaleString()} icon={PhoneCall} tone="primary" hint={t("dashboard.selectedPeriod")} />
        <StatCard label={t("dashboard.activated")} value={activated} icon={Award} tone="success" />
        <StatCard
          label={t("dashboard.activationRate")}
          value={(totalCalls ? (activated / totalCalls) * 100 : 0).toFixed(1)}
          suffix="%"
          icon={Target}
          tone="info"
          hint={t("dashboard.activationRateHint", { a: activated, t: totalCalls })}
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
              <div key={s} className={`rounded-lg border border-border/60 p-3 ${STATUS_CLASS[s]}`}>
                <div className="text-xs font-medium opacity-80">{t(`status.${s}`)}</div>
                <div className="mt-1 text-2xl font-bold">{statusCounts[s].toLocaleString()}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatCard label={t("dashboard.callSuccessRate")} value={successRate.toFixed(1)} suffix="%" icon={TrendingUp} tone="primary" hint={t("dashboard.callSuccessHint")} />
        <StatCard label={t("dashboard.activationSuccessRate")} value={activationRate.toFixed(1)} suffix="%" icon={Award} tone="success" hint={t("dashboard.activationSuccessHint")} />
      </div>

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
