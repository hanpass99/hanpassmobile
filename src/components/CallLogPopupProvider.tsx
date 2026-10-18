import { localizeError } from "@/i18n/localize-error";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CUSTOMER_STATUSES, STATUS_LABEL, type CustomerStatus } from "@/lib/labels";

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
      toast.error(localizeError(t("callLogs.selectStatus", {})));
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
        const nameChanged = trimmed.length > 0 && trimmed !== (row.customer?.name ?? "");
        const { error: e2 } = await supabase.rpc("staff_update_customer_basic", {
          _customer_id: row.customer_id,
          _name: nameChanged ? trimmed : (undefined as unknown as string),
          _status: status,
        } as never);
        if (e2) throw e2;
      }
      toast.success(t("common.saved", {}));
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(localizeError(err?.message ?? "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!row}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("callLogs.newCall", {})}</DialogTitle>
          <DialogDescription>{t("callLogs.newCallDesc", {})}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">{t("callLogs.customer", {})}</Label>
              <Input
                className="mt-1 h-8"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={!row.customer_id}
                placeholder={row.customer_id ? "" : "—"}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                {t("callLogs.customerPhone", {})}
              </Label>
              <div className="mt-1 font-mono text-xs">{row.customer_phone ?? "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("callLogs.startedAt", {})}</Label>
              <div className="mt-1">{format(new Date(row.started_at), "yyyy-MM-dd HH:mm:ss")}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("callLogs.duration", {})}</Label>
              <div className="mt-1 font-mono">{formatDuration(row.duration_sec)}</div>
            </div>
          </div>

          <div>
            <Label>{t("callLogs.callStatus", {})}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CustomerStatus)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t("callLogs.selectStatus", {})} />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("callLogs.memo", {})}</Label>
            <Textarea
              className="mt-1"
              rows={4}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("callLogs.memoPlaceholder", {})}
            />
          </div>

          {!row.customer_id && (
            <p className="text-xs text-muted-foreground">{t("callLogs.noCustomerLink", {})}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel", {})}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? t("common.saving", {}) : t("common.save", {})}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
