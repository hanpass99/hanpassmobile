import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  CalendarIcon, Users2, PhoneCall, Award, TrendingUp, ChevronDown, ChevronRight, Search,
} from "lucide-react";
import i18n from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { dateKey } from "@/lib/date-range";
import { CUSTOMER_STATUSES, STATUS_CLASS, type CustomerStatus } from "@/lib/labels";
import { useAuth } from "@/hooks/use-auth";
import {
  HANPASS_POOLS, useHanpassCountries, useHanpassDashboard, useHanpassStaff,
} from "@/hooks/use-hanpass-dashboard";
import type { HanpassStaffRow, HanpassTeamRow } from "@/types/rpc";

type Search = {
  from: string;
  to: string;
  country: string;
  staff: string;
  pool: string;
  status: string;
};

const todayKey = () => dateKey(new Date());
const monthStartKey = () => {
  const d = new Date();
  return dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const Route = createFileRoute("/hanpass-dashboard")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    from: typeof search["from"] === "string" && search["from"] ? search["from"] : monthStartKey(),
    to: typeof search["to"] === "string" && search["to"] ? search["to"] : todayKey(),
    country: typeof search["country"] === "string" ? search["country"] : "all",
    staff: typeof search["staff"] === "string" ? search["staff"] : "all",
    pool: typeof search["pool"] === "string" ? search["pool"] : "all",
    status: typeof search["status"] === "string" ? search["status"] : "all",
  }),
  head: () => ({
    meta: [
      { title: i18n.t("hanpassDash.headTitle") },
      { name: "description", content: i18n.t("hanpassDash.headDesc") },
      { property: "og:title", content: i18n.t("hanpassDash.headTitle") },
      { property: "og:description", content: i18n.t("hanpassDash.headDesc") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HanpassDashboardPage,
  errorComponent: ({ error }) => (
    <Card role="alert"><CardContent className="p-6 text-center text-sm">{error.message}</CardContent></Card>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">—</div>,
});

function parseKey(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y ?? 2020, (m ?? 1) - 1, d ?? 1);
}

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}

function delta(cur: number, prev: number) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function HanpassDashboardPage() {
  const { t } = useTranslation();
  const navigate = Route.useNavigate();
  const sp = Route.useSearch();
  const { isAdmin, isHanpass } = useAuth();
  const allowed = isAdmin || isHanpass;

  const from = parseKey(sp.from);
  const to = parseKey(sp.to);

  const setSearch = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const { data: countries = [] } = useHanpassCountries();
  const { data: staffList = [] } = useHanpassStaff();

  const q = useHanpassDashboard({
    from,
    to,
    countryIds: sp.country === "all" ? [] : [sp.country],
    staffIds: sp.staff === "all" ? [] : [sp.staff],
    pools: sp.pool === "all" ? [...HANPASS_POOLS] : [sp.pool],
    enabled: allowed,
  });

  const d = q.data ?? {};
  const totals = d.totals ?? {};
  const prev = d.prev_totals ?? {};
  const handled = Number(totals.handled ?? 0);
  const activated = Number(totals.activated ?? 0);
  const custCount = Number(totals.customers ?? 0);
  const staffCount = Number(totals.staff ?? 0);
  const loading = q.isLoading;

  const dailyData = useMemo(
    () =>
      (d.daily ?? []).map((r) => ({
        date: r.day.slice(5).replace("-", "/"),
        [t("hanpassDash.handled")]: Number(r.handled),
        [t("hanpassDash.activated")]: Number(r.activated),
      })),
    [d.daily, t],
  );

  const days = useMemo(() => {
    const out: string[] = [];
    const cur = new Date(from);
    const end = new Date(to);
    let guard = 0;
    while (cur <= end && guard < 120) {
      out.push(dateKey(cur));
      cur.setDate(cur.getDate() + 1);
      guard += 1;
    }
    return out;
  }, [sp.from, sp.to]);

  const heat = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of d.heatmap ?? []) m.set(`${h.staff_id}|${h.day}`, Number(h.cnt));
    return m;
  }, [d.heatmap]);

  const heatMax = useMemo(
    () => Math.max(1, ...(d.heatmap ?? []).map((h) => Number(h.cnt))),
    [d.heatmap],
  );

  const [staffSearch, setStaffSearch] = useState("");
  const [sortKey, setSortKey] = useState<"handled" | "activated" | "rate" | "name">("handled");
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  const byStaff = d.by_staff ?? [];
  const byTeam = d.by_team ?? [];

  const staffRows = useMemo(() => {
    const term = staffSearch.trim().toLowerCase();
    const rows = byStaff.filter((r) => !term || (r.name ?? "").toLowerCase().includes(term));
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sortKey === "rate") return pct(b.activated, b.handled) - pct(a.activated, a.handled);
      return Number(b[sortKey]) - Number(a[sortKey]);
    });
    return sorted;
  }, [byStaff, staffSearch, sortKey]);

  const statusSel = sp.status === "all" ? null : sp.status;

  if (!allowed) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        {t("hanpassDash.noAccess")}
      </CardContent></Card>
    );
  }

  const handledDelta = delta(handled, Number(prev.handled ?? 0));
  const activatedDelta = delta(activated, Number(prev.activated ?? 0));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("hanpassDash.title")}
        description={`${t("hanpassDash.subtitle")} · ${format(from, "yyyy.MM.dd")} ~ ${format(to, "yyyy.MM.dd")}`}
      />

      {/* 필터 */}
      <Card>
        <CardContent className="grid grid-cols-2 items-end gap-3 p-4 lg:flex lg:flex-wrap">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("common.startDate")}</div>
            <DatePick value={from} onChange={(v) => setSearch({ from: dateKey(v) })} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("common.endDate")}</div>
            <DatePick value={to} onChange={(v) => setSearch({ to: dateKey(v) })} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("hanpassDash.team")}</div>
            <Select value={sp.country} onValueChange={(v) => setSearch({ country: v })}>
              <SelectTrigger className="w-full lg:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("hanpassDash.allTeams")}</SelectItem>
                {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("hanpassDash.staff")}</div>
            <Select value={sp.staff} onValueChange={(v) => setSearch({ staff: v })}>
              <SelectTrigger className="w-full lg:w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("hanpassDash.allStaff")}</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("hanpassDash.pool")}</div>
            <Select value={sp.pool} onValueChange={(v) => setSearch({ pool: v })}>
              <SelectTrigger className="w-full lg:w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("hanpassDash.allPools")}</SelectItem>
                {HANPASS_POOLS.map((p) => (
                  <SelectItem key={p} value={p}>{t(`pool.${p}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-wrap gap-2 lg:ml-auto">
            <Button variant="outline" size="sm" onClick={() => setSearch({ from: todayKey(), to: todayKey() })}>
              {t("hanpassDash.today")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSearch({ from: monthStartKey(), to: todayKey() })}>
              {t("hanpassDash.thisMonth")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch({ from: monthStartKey(), to: todayKey(), country: "all", staff: "all", pool: "all", status: "all" })}
            >
              {t("common.reset")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 핵심 지표 */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label={t("hanpassDash.handled")}
            value={handled.toLocaleString()}
            icon={PhoneCall}
            tone="primary"
            hint={`${t("hanpassDash.staffCount")} ${staffCount} · ${deltaText(handledDelta, t("hanpassDash.vsPrev"))}`}
          />
          <StatCard
            label={t("hanpassDash.customersTouched")}
            value={custCount.toLocaleString()}
            icon={Users2}
            tone="info"
            hint={t("hanpassDash.dedupHint")}
          />
          <StatCard
            label={t("hanpassDash.activated")}
            value={activated.toLocaleString()}
            icon={Award}
            tone="success"
            hint={deltaText(activatedDelta, t("hanpassDash.vsPrev"))}
          />
          <StatCard
            label={t("hanpassDash.successRate")}
            value={pct(activated, handled).toFixed(1)}
            suffix="%"
            icon={TrendingUp}
            tone="muted"
            hint={`${activated}/${handled}`}
          />
        </div>
      )}

      {q.isError && (
        <Card role="alert">
          <CardContent className="space-y-3 p-6 text-center">
            <div className="text-sm font-semibold">{t("dashboard.loadError")}</div>
            <div className="text-xs text-muted-foreground">{(q.error as Error)?.message}</div>
            <Button size="sm" onClick={() => void q.refetch()}>{t("dashboard.retry")}</Button>
          </CardContent>
        </Card>
      )}

      {/* 일별 추이 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("hanpassDash.trend")}</CardTitle>
          <CardDescription>{t("hanpassDash.trendDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px] px-1 sm:px-5">
          {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                <Line type="monotone" dataKey={t("hanpassDash.handled")} stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey={t("hanpassDash.activated")} stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 상태 분포 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("hanpassDash.statusDist")}</CardTitle>
          <CardDescription>{t("hanpassDash.statusDistDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {CUSTOMER_STATUSES.map((s) => {
              const n = Number((d.status_counts ?? {})[s] ?? 0);
              const on = statusSel === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSearch({ status: on ? "all" : s })}
                  className={cn(
                    "rounded-lg border border-border/60 p-3 text-left transition hover:scale-[1.02] hover:shadow-md",
                    STATUS_CLASS[s as CustomerStatus],
                    on && "ring-2 ring-primary",
                  )}
                >
                  <div className="text-xs font-medium opacity-80">{t(`status.${s}`)}</div>
                  <div className="mt-1 text-2xl font-bold">{n.toLocaleString()}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 팀(나라)별 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("hanpassDash.byTeam")}</CardTitle>
          <CardDescription>{t("hanpassDash.byTeamDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <Skeleton className="h-24 w-full" />}
          {!loading && !byTeam.length && (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          )}
          {byTeam.map((teamRow: HanpassTeamRow) => {
            const key = teamRow.country_id ?? "none";
            const open = openTeam === key;
            const members = byStaff.filter((s) => (s.teams ?? []).includes(teamRow.code));
            return (
              <div key={key} className="rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() => setOpenTeam(open ? null : key)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="w-12 shrink-0 font-display text-sm font-bold">{teamRow.code}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {teamRow.staff}{t("hanpassDash.personUnit")}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-3 text-xs sm:gap-5">
                    <Metric label={t("hanpassDash.handled")} value={teamRow.handled} />
                    <Metric label={t("hanpassDash.activated")} value={teamRow.activated} />
                    <Metric
                      label={t("hanpassDash.successRate")}
                      value={`${pct(teamRow.activated, teamRow.handled).toFixed(0)}%`}
                    />
                  </div>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-border/60 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(teamRow.status_counts ?? {}).map(([s, n]) => (
                        <Badge key={s} variant="outline" className={cn("text-[11px]", STATUS_CLASS[s as CustomerStatus])}>
                          {t(`status.${s}`)} {n}
                        </Badge>
                      ))}
                    </div>
                    {members.map((m) => (
                      <StaffLine key={m.staff_id} row={m} statusSel={statusSel} />
                    ))}
                    {!members.length && (
                      <div className="text-xs text-muted-foreground">{t("common.empty")}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 직원별 상세 */}
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("hanpassDash.byStaff")}</CardTitle>
            <CardDescription>{t("hanpassDash.byStaffDesc")}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder={t("hanpassDash.searchStaff")}
                className="h-9 w-full pl-8 sm:w-[180px]"
              />
            </div>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="handled">{t("hanpassDash.handled")}</SelectItem>
                <SelectItem value="activated">{t("hanpassDash.activated")}</SelectItem>
                <SelectItem value="rate">{t("hanpassDash.successRate")}</SelectItem>
                <SelectItem value="name">{t("hanpassDash.name")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <Skeleton className="h-40 w-full" />}
          {!loading && !staffRows.length && (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          )}
          {staffRows.map((r) => <StaffLine key={r.staff_id} row={r} statusSel={statusSel} detailed />)}
        </CardContent>
      </Card>

      {/* 일자 × 직원 히트맵 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("hanpassDash.heatmap")}</CardTitle>
          <CardDescription>{t("hanpassDash.heatmapDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <Skeleton className="h-40 w-full" /> : (
            <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card p-1 text-left font-medium text-muted-foreground">
                    {t("hanpassDash.name")}
                  </th>
                  {days.map((day) => (
                    <th key={day} className="p-1 font-normal text-muted-foreground">{day.slice(8)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffRows.map((r) => (
                  <tr key={r.staff_id}>
                    <td className="sticky left-0 z-10 max-w-[140px] truncate bg-card p-1 font-medium">{r.name}</td>
                    {days.map((day) => {
                      const n = heat.get(`${r.staff_id}|${day}`) ?? 0;
                      const alpha = n ? 0.15 + 0.75 * (n / heatMax) : 0;
                      return (
                        <td
                          key={day}
                          title={`${r.name} · ${day} · ${n}`}
                          className="h-7 w-7 rounded text-center"
                          style={{
                            backgroundColor: n ? `hsl(var(--primary) / ${alpha})` : "hsl(var(--muted))",
                            color: alpha > 0.6 ? "hsl(var(--primary-foreground))" : undefined,
                          }}
                        >
                          {n || ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !staffRows.length && (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          )}
        </CardContent>
      </Card>

      {/* 최근 활동 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("hanpassDash.recent")}</CardTitle>
          <CardDescription>{t("hanpassDash.recentDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {(d.recent ?? [])
            .filter((r) => !statusSel || r.status === statusSel)
            .map((r, i) => (
              <div
                key={`${r.at}-${i}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-xs"
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {format(new Date(r.at), "MM.dd HH:mm")}
                </span>
                <span className="min-w-0 truncate">
                  <span className="font-medium">{r.staff}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span>{r.customer}</span>
                  {r.code && <span className="ml-1 text-muted-foreground">({r.code})</span>}
                </span>
                <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[r.status as CustomerStatus])}>
                  {t(`status.${r.status}`)}
                </Badge>
              </div>
            ))}
          {!loading && !(d.recent ?? []).length && (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          )}
          <div className="pt-2 text-center">
            <Link
              to="/customers"
              search={{ pool: "activation_request" }}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              {t("hanpassDash.goCustomers")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function deltaText(v: number | null, label: string) {
  if (v === null) return label + " —";
  return `${label} ${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</span>
    </span>
  );
}

function StaffLine({
  row, statusSel, detailed,
}: { row: HanpassStaffRow; statusSel: string | null; detailed?: boolean }) {
  const { t } = useTranslation();
  const rate = pct(row.activated, row.handled);
  const selCount = statusSel ? Number(row.status_counts?.[statusSel] ?? 0) : null;
  return (
    <div className="rounded-md border border-border/50 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
        {(row.teams ?? []).map((c) => (
          <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
        ))}
        {selCount !== null && (
          <Badge variant="outline" className="text-[10px]">
            {t(`status.${statusSel}`)} {selCount}
          </Badge>
        )}
        <div className="flex items-center gap-3 text-xs sm:gap-5">
          <Metric label={t("hanpassDash.handled")} value={row.handled} />
          <Metric label={t("hanpassDash.activated")} value={row.activated} />
          <Metric label={t("hanpassDash.successRate")} value={`${rate.toFixed(0)}%`} />
        </div>
      </div>
      {detailed && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            {t("hanpassDash.activeDays")} {row.active_days} · {t("hanpassDash.lastActivity")}{" "}
            {row.last_at ? format(new Date(row.last_at), "MM.dd HH:mm") : "—"}
          </span>
          {Object.entries(row.status_counts ?? {}).map(([s, n]) => (
            <Badge key={s} variant="outline" className={cn("text-[10px]", STATUS_CLASS[s as CustomerStatus])}>
              {t(`status.${s}`)} {n}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function DatePick({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-start text-left font-normal lg:w-[150px]")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(value, "yyyy.MM.dd")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(dd) => dd && onChange(dd)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
