import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, RefreshCw } from "lucide-react";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CUSTOMER_STATUSES, STATUS_LABEL, STATUS_CLASS, type CustomerStatus,
} from "@/lib/labels";
import { CallLogPopupDialog } from "@/components/CallLogPopupProvider";
import { dayEndIso, dayStartIso } from "@/lib/date-range";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/call-logs")({
  head: () => ({ meta: [{ title: i18n.t("head.callLogs", { defaultValue: "통화 로그 — Hanpass OB CRM" }) }] }),
  component: CallLogsPage,
});

type Row = {
  id: string;
  staff_id: string | null;
  employee_phone: string;
  customer_phone: string | null;
  customer_id: string | null;
  direction: string;
  status: string | null;
  call_status: CustomerStatus | null;
  memo: string | null;
  duration_sec: number;
  started_at: string;
  staff: { display_name: string | null } | null;
  customer: { name: string | null } | null;
};

function formatDuration(sec: number) {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function DirectionBadge({ direction }: { direction: string }) {
  const map: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
    incoming: { icon: <PhoneIncoming className="h-3 w-3" />, className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200", label: "수신" },
    outgoing: { icon: <PhoneOutgoing className="h-3 w-3" />, className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200", label: "발신" },
    missed:   { icon: <PhoneMissed className="h-3 w-3" />, className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200", label: "부재중" },
  };
  const it = map[direction] ?? { icon: null, className: "bg-muted text-muted-foreground", label: direction };
  return (
    <Badge variant="outline" className={`gap-1 border-transparent ${it.className}`}>
      {it.icon}
      {it.label}
    </Badge>
  );
}

const SELECT_QUERY = "id, staff_id, employee_phone, customer_phone, customer_id, direction, status, call_status, memo, duration_sec, started_at, staff:profiles!phone_call_logs_staff_id_fkey(display_name), customer:customers(name)";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CallLogsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [popupRow, setPopupRow] = useState<Row | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(daysAgoStr(6));
  const [dateTo, setDateTo] = useState<string>(todayStr());

  const fromIso = dayStartIso(new Date(dateFrom));
  const toIso = dayEndIso(new Date(dateTo));

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["phone_call_logs", fromIso, toIso, isAdmin ? "all" : user?.id ?? "me"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("phone_call_logs")
        .select(SELECT_QUERY)
        .gte("started_at", fromIso)
        .lte("started_at", toIso)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (!isAdmin && user) q = q.eq("staff_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("phone_call_logs:table")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phone_call_logs" },
        () => qc.invalidateQueries({ queryKey: ["phone_call_logs"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Aggregate stats per staff
  const stats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; statuses: Record<string, number> }>();
    (data ?? []).forEach((r) => {
      const key = r.staff_id ?? "unknown";
      const name = r.staff?.display_name ?? (r.staff_id ? "—" : "미배정");
      if (!map.has(key)) map.set(key, { name, total: 0, statuses: {} });
      const entry = map.get(key)!;
      entry.total += 1;
      const s = r.call_status ?? "unset";
      entry.statuses[s] = (entry.statuses[s] ?? 0) + 1;
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const totalCalls = (data ?? []).length;
  const totalActivated = (data ?? []).filter((r) => r.call_status === "activated").length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={t("nav.callLogs", { defaultValue: "통화 로그" })}
        description={t("callLogs.desc", { defaultValue: "직원별 통화 이력을 최신순으로 확인합니다." })}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        }
      />

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div>
          <Label className="text-xs">{t("common.from", { defaultValue: "시작일" })}</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-[160px]" />
        </div>
        <div>
          <Label className="text-xs">{t("common.to", { defaultValue: "종료일" })}</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-[160px]" />
        </div>
        <div className="ml-auto flex gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(todayStr()); setDateTo(todayStr()); }}>
            {t("callLogs.today", { defaultValue: "오늘" })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(daysAgoStr(6)); setDateTo(todayStr()); }}>
            {t("callLogs.last7", { defaultValue: "최근 7일" })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(daysAgoStr(29)); setDateTo(todayStr()); }}>
            {t("callLogs.last30", { defaultValue: "최근 30일" })}
          </Button>
        </div>
      </div>

      {/* Dashboard summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("callLogs.totalCalls", { defaultValue: "총 통화 수" })}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalCalls}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("callLogs.totalActivated", { defaultValue: "개통 완료" })}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{totalActivated}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAdmin ? t("callLogs.activeStaff", { defaultValue: "활동 직원" }) : t("callLogs.avgDuration", { defaultValue: "평균 통화(초)" })}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{isAdmin ? stats.length : (totalCalls ? Math.round((data ?? []).reduce((a, r) => a + (r.duration_sec ?? 0), 0) / totalCalls) : 0)}</div></CardContent>
        </Card>
      </div>

      {/* Pretty status grid */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">{t("callLogs.statusOverview", { defaultValue: "상태별 통계" })}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {CUSTOMER_STATUSES.map((s) => {
            const count = (data ?? []).filter((r) => r.call_status === s).length;
            return (
              <div key={s} className={`rounded-xl px-4 py-3 ${STATUS_CLASS[s]}`}>
                <div className="text-xs font-medium opacity-80">{STATUS_LABEL[s]}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{count.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff stats table — admin only */}
      {isAdmin && (
      <div className="rounded-lg border bg-card overflow-x-auto">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("callLogs.staffStats", { defaultValue: "직원별 통계" })}</h2>
          <p className="text-xs text-muted-foreground">{t("callLogs.staffStatsDesc", { defaultValue: "선택한 기간 동안의 직원별 통화 건수와 상태별 결과" })}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("callLogs.staff", { defaultValue: "직원" })}</TableHead>
              <TableHead className="text-right">{t("callLogs.totalCalls", { defaultValue: "총 통화" })}</TableHead>
              {CUSTOMER_STATUSES.map((s) => (
                <TableHead key={s} className="text-right whitespace-nowrap">{STATUS_LABEL[s]}</TableHead>
              ))}
              <TableHead className="text-right">{t("callLogs.unset", { defaultValue: "미분류" })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={CUSTOMER_STATUSES.length + 3}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
            ) : stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={CUSTOMER_STATUSES.length + 3} className="h-24 text-center text-sm text-muted-foreground">
                  {t("callLogs.empty", { defaultValue: "통화 로그가 없습니다." })}
                </TableCell>
              </TableRow>
            ) : (
              stats.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right font-mono">{s.total}</TableCell>
                  {CUSTOMER_STATUSES.map((st) => (
                    <TableCell key={st} className="text-right font-mono text-xs">
                      {s.statuses[st] ?? 0}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {s.statuses["unset"] ?? 0}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Recent calls */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("callLogs.recentTitle", { defaultValue: "통화 목록" })}</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("callLogs.startedAt", { defaultValue: "시작 시각" })}</TableHead>
              <TableHead>{t("callLogs.staff", { defaultValue: "직원" })}</TableHead>
              <TableHead>{t("callLogs.employeePhone", { defaultValue: "직원 번호" })}</TableHead>
              <TableHead>{t("callLogs.direction", { defaultValue: "방향" })}</TableHead>
              <TableHead>{t("callLogs.customer", { defaultValue: "고객" })}</TableHead>
              <TableHead>{t("callLogs.customerPhone", { defaultValue: "고객 번호" })}</TableHead>
              <TableHead>{t("callLogs.callStatus", { defaultValue: "통화 상태" })}</TableHead>
              <TableHead>{t("callLogs.memo", { defaultValue: "메모" })}</TableHead>
              <TableHead className="text-right">{t("callLogs.duration", { defaultValue: "통화 시간" })}</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                  {t("callLogs.empty", { defaultValue: "통화 로그가 없습니다." })}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(row.started_at), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell className="text-sm">{row.staff?.display_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.employee_phone}</TableCell>
                  <TableCell><DirectionBadge direction={row.direction} /></TableCell>
                  <TableCell className="text-sm">{row.customer?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.customer_phone ?? "—"}</TableCell>
                  <TableCell>
                    {row.call_status ? (
                      <Badge variant="outline" className={STATUS_CLASS[row.call_status]}>
                        {STATUS_LABEL[row.call_status]}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground" title={row.memo ?? ""}>
                    {row.memo ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatDuration(row.duration_sec)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setPopupRow(row)}>
                      {t("common.edit", { defaultValue: "편집" })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CallLogPopupDialog
        row={popupRow as any}
        onClose={() => setPopupRow(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["phone_call_logs"] })}
      />
    </div>
  );
}
