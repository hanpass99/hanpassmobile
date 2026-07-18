import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, RefreshCw } from "lucide-react";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CUSTOMER_STATUSES, STATUS_LABEL, STATUS_CLASS, type CustomerStatus,
} from "@/lib/labels";

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

function CallLogsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [popupRow, setPopupRow] = useState<Row | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["phone_call_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phone_call_logs")
        .select(SELECT_QUERY)
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  // Realtime: pop up when a new call log for this staff arrives
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`phone_call_logs:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "phone_call_logs", filter: `staff_id=eq.${user.id}` },
        async (payload) => {
          qc.invalidateQueries({ queryKey: ["phone_call_logs"] });
          const newId = (payload.new as any)?.id;
          if (!newId) return;
          const { data: full } = await supabase
            .from("phone_call_logs")
            .select(SELECT_QUERY)
            .eq("id", newId)
            .maybeSingle();
          if (full) setPopupRow(full as unknown as Row);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "phone_call_logs" },
        () => qc.invalidateQueries({ queryKey: ["phone_call_logs"] })
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

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

      <div className="rounded-lg border bg-card overflow-x-auto">
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
              Array.from({ length: 8 }).map((_, i) => (
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

      <CallLogDialog
        row={popupRow}
        onClose={() => setPopupRow(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["phone_call_logs"] });
          setPopupRow(null);
        }}
      />
    </div>
  );
}

function CallLogDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CustomerStatus | "">("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setStatus(row.call_status ?? "");
      setMemo(row.memo ?? "");
    }
  }, [row?.id]);

  if (!row) return null;

  const save = async () => {
    if (!status) {
      toast.error(t("callLogs.selectStatus", { defaultValue: "상태를 선택하세요." }));
      return;
    }
    setSaving(true);
    try {
      const { error: e1 } = await supabase
        .from("phone_call_logs")
        .update({ call_status: status, memo: memo || null })
        .eq("id", row.id);
      if (e1) throw e1;

      if (row.customer_id) {
        const { error: e2 } = await supabase
          .from("customers")
          .update({ status })
          .eq("id", row.customer_id);
        if (e2) throw e2;
      }
      toast.success(t("common.saved", { defaultValue: "저장되었습니다." }));
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("callLogs.newCall", { defaultValue: "새 통화" })}</DialogTitle>
          <DialogDescription>
            {t("callLogs.newCallDesc", { defaultValue: "통화 상태와 메모를 기록하세요." })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t("callLogs.customer", { defaultValue: "고객" })}</Label>
              <div className="mt-1">{row.customer?.name ?? "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("callLogs.customerPhone", { defaultValue: "고객 번호" })}</Label>
              <div className="mt-1 font-mono text-xs">{row.customer_phone ?? "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("callLogs.startedAt", { defaultValue: "시작 시각" })}</Label>
              <div className="mt-1">{format(new Date(row.started_at), "yyyy-MM-dd HH:mm:ss")}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("callLogs.duration", { defaultValue: "통화 시간" })}</Label>
              <div className="mt-1 font-mono">{formatDuration(row.duration_sec)}</div>
            </div>
          </div>

          <div>
            <Label>{t("callLogs.callStatus", { defaultValue: "통화 상태" })}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CustomerStatus)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t("callLogs.selectStatus", { defaultValue: "상태를 선택하세요." })} />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("callLogs.memo", { defaultValue: "메모" })}</Label>
            <Textarea
              className="mt-1"
              rows={4}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("callLogs.memoPlaceholder", { defaultValue: "통화 내용을 입력하세요." })}
            />
          </div>

          {!row.customer_id && (
            <p className="text-xs text-muted-foreground">
              {t("callLogs.noCustomerLink", { defaultValue: "이 통화에는 연결된 고객이 없어 고객 상태는 업데이트되지 않습니다." })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel", { defaultValue: "취소" })}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? t("common.saving", { defaultValue: "저장 중..." }) : t("common.save", { defaultValue: "저장" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
