import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, RefreshCw } from "lucide-react";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/call-logs")({
  head: () => ({ meta: [{ title: i18n.t("head.callLogs", { defaultValue: "통화 로그 — Hanpass OB CRM" }) }] }),
  component: CallLogsPage,
});

type Row = {
  id: string;
  employee_phone: string;
  customer_phone: string | null;
  direction: string;
  status: string | null;
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

function CallLogsPage() {
  const { t } = useTranslation();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["phone_call_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phone_call_logs")
        .select("id, employee_phone, customer_phone, direction, status, duration_sec, started_at, staff:profiles!phone_call_logs_staff_id_fkey(display_name), customer:customers(name)")
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

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

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("callLogs.startedAt", { defaultValue: "시작 시각" })}</TableHead>
              <TableHead>{t("callLogs.staff", { defaultValue: "직원" })}</TableHead>
              <TableHead>{t("callLogs.employeePhone", { defaultValue: "직원 번호" })}</TableHead>
              <TableHead>{t("callLogs.direction", { defaultValue: "방향" })}</TableHead>
              <TableHead>{t("callLogs.customer", { defaultValue: "고객" })}</TableHead>
              <TableHead>{t("callLogs.customerPhone", { defaultValue: "고객 번호" })}</TableHead>
              <TableHead>{t("callLogs.status", { defaultValue: "상태" })}</TableHead>
              <TableHead className="text-right">{t("callLogs.duration", { defaultValue: "통화 시간" })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                  {t("callLogs.empty", { defaultValue: "통화 로그가 없습니다." })}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(row.started_at), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell className="text-sm">{row.staff?.full_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.employee_phone}</TableCell>
                  <TableCell><DirectionBadge direction={row.direction} /></TableCell>
                  <TableCell className="text-sm">{row.customer?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.customer_phone ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.status ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatDuration(row.duration_sec)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
