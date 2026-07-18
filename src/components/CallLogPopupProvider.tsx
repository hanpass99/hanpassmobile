import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CUSTOMER_STATUSES, STATUS_LABEL, type CustomerStatus,
} from "@/lib/labels";

type Row = {
  id: string;
  customer_id: string | null;
  customer_phone: string | null;
  duration_sec: number;
  started_at: string;
  call_status: CustomerStatus | null;
  memo: string | null;
  customer: { name: string | null } | null;
};

const SELECT_QUERY =
  "id, customer_id, customer_phone, duration_sec, started_at, call_status, memo, customer:customers(name)";

function formatDuration(sec: number) {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function CallLogPopupProvider() {
  const { user } = useAuth();
  const [row, setRow] = useState<Row | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`global-call-log:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "phone_call_logs",
          filter: `staff_id=eq.${user.id}`,
        },
        async (payload) => {
          const newId = (payload.new as any)?.id;
          if (!newId) return;
          const { data } = await supabase
            .from("phone_call_logs")
            .select(SELECT_QUERY)
            .eq("id", newId)
            .maybeSingle();
          if (data) setRow(data as unknown as Row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return <CallLogPopupDialog row={row} onClose={() => setRow(null)} />;
}

export function CallLogPopupDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CustomerStatus | "">("");
  const [memo, setMemo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setStatus(row.call_status ?? "");
      setMemo(row.memo ?? "");
      setCustomerName(row.customer?.name ?? "");
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
        const trimmed = customerName.trim();
        const patch: { status: CustomerStatus; name?: string } = { status };
        if (trimmed && trimmed !== (row.customer?.name ?? "")) patch.name = trimmed;
        const { error: e2 } = await supabase
          .from("customers")
          .update(patch)
          .eq("id", row.customer_id);
        if (e2) throw e2;
      }
      toast.success(t("common.saved", { defaultValue: "저장되었습니다." }));
      onSaved?.();
      onClose();
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
