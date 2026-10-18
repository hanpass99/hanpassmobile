import { localizeError } from "@/i18n/localize-error";
import { useTranslation } from "react-i18next";
import { uiCopy } from "@/i18n/ui-copy";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bell, Send, Users, Eye } from "lucide-react";
import i18n from "@/i18n";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: uiCopy("pages.notifications.title") },
      { name: "description", content: uiCopy("pages.notifications.description") },
      { property: "og:title", content: uiCopy("pages.notifications.title") },
      { property: "og:description", content: uiCopy("pages.notifications.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

type Staff = { id: string; display_name: string; phone: string | null; is_active: boolean };
type Recipient = {
  user_id: string;
  display_name: string | null;
  acknowledged_at: string | null;
  sms_status: string | null;
};
type SentRow = {
  id: string;
  title: string | null;
  message: string;
  created_at: string;
  total: number;
  acked: number;
  sms_ok: number;
  sms_fail: number;
  recipients: Recipient[];
};

function NotificationsPage() {
  useTranslation();
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [sending, setSending] = useState(false);
  const [detailNoti, setDetailNoti] = useState<SentRow | null>(null);

  const { data: staff = [] } = useQuery({
    queryKey: ["noti-staff"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, phone, is_active, sort_order")
        .order("sort_order")
        .order("display_name");
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.is_active) as Staff[];
    },
  });

  const { data: history = [] } = useQuery<SentRow[]>({
    queryKey: ["noti-history"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: notis, error } = await supabase
        .from("admin_notifications")
        .select("id, title, message, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!notis?.length) return [];
      const ids = notis.map((n: any) => n.id);
      const { data: recs } = await supabase
        .from("admin_notification_recipients")
        .select("notification_id, user_id, acknowledged_at, sms_status")
        .in("notification_id", ids);
      const userIds = Array.from(new Set((recs ?? []).map((r: any) => r.user_id)));
      const { data: profs } = userIds.length
        ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
      return notis.map((n: any) => {
        const rs = (recs ?? []).filter((r: any) => r.notification_id === n.id);
        const recipients: Recipient[] = rs.map((r: any) => ({
          user_id: r.user_id,
          display_name: nameMap.get(r.user_id) ?? r.user_id.slice(0, 8),
          acknowledged_at: r.acknowledged_at,
          sms_status: r.sms_status,
        }));
        return {
          id: n.id,
          title: n.title,
          message: n.message,
          created_at: n.created_at,
          total: rs.length,
          acked: rs.filter((r: any) => r.acknowledged_at).length,
          sms_ok: rs.filter((r: any) => r.sms_status === "sent").length,
          sms_fail: rs.filter((r: any) => r.sms_status === "failed").length,
          recipients,
        };
      });
    },
  });

  const toggleAll = (on: boolean) => {
    setSelected(on ? new Set(staff.map((s) => s.id)) : new Set());
  };
  const toggleOne = (id: string, on: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const selectedStaff = useMemo(() => staff.filter((s) => selected.has(s.id)), [staff, selected]);
  const withPhone = selectedStaff.filter((s) => (s.phone ?? "").replace(/[^0-9]/g, "").length >= 9);

  const send = async () => {
    if (!user) return;
    if (!message.trim()) return toast.error(localizeError(uiCopy("ux.copy639327aa73")));
    if (selectedStaff.length === 0) return toast.error(localizeError(uiCopy("ux.copy17e717e325")));
    setSending(true);
    try {
      const { data: noti, error: nErr } = await supabase
        .from("admin_notifications")
        .insert({ sender_id: user.id, title: title.trim() || null, message: message.trim() })
        .select("id")
        .single();
      if (nErr || !noti) throw nErr ?? new Error("failed");

      const rows = selectedStaff.map((s) => ({ notification_id: noti.id, user_id: s.id }));
      const { error: rErr } = await supabase.from("admin_notification_recipients").insert(rows);
      if (rErr) throw rErr;

      let smsInfo = "";
      if (sendSms && withPhone.length) {
        const smsText = (title.trim() ? `[${title.trim()}] ` : "[공지] ") + message.trim();
        const receivers = withPhone.map((s) => ({
          name: s.display_name,
          phone: s.phone!.replace(/[^0-9]/g, ""),
        }));
        const { data: smsRes, error: sErr } = await supabase.functions.invoke("send-sms", {
          body: { receivers, message: smsText, title: title.trim() || "공지" },
        });
        if (sErr) {
          smsInfo = uiCopy("ux.copy3fd23e3fdc", { value0: sErr.message });
        } else {
          const ok = (smsRes as any)?.ok;
          const status = ok ? "sent" : "failed";
          await supabase
            .from("admin_notification_recipients")
            .update({ sms_status: status, sms_error: ok ? null : ((smsRes as any)?.error ?? null) })
            .eq("notification_id", noti.id)
            .in(
              "user_id",
              withPhone.map((s) => s.id),
            );
          smsInfo = ok
            ? uiCopy("ux.copyfe5acbf748", { value0: withPhone.length })
            : uiCopy("ux.copy3484da77e2");
        }
        const skipped = selectedStaff.length - withPhone.length;
        if (skipped > 0) smsInfo += uiCopy("ux.copyb2c7761573", { value0: skipped });
      }

      toast.success(uiCopy("ux.copy36869a1e4f", { value0: selectedStaff.length, value1: smsInfo }));
      setTitle("");
      setMessage("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["noti-history"] });
    } catch (e: any) {
      toast.error(localizeError(uiCopy("ux.copybf7e58346d", { value0: e?.message ?? e })));
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title={uiCopy("ux.copy79500c9b6b")} description={uiCopy("ux.copy5a5a3d6567")} />
      </div>
    );
  }

  const allSelected = staff.length > 0 && selected.size === staff.length;

  return (
    <div className="space-y-4">
      <PageHeader title={uiCopy("ux.copy79500c9b6b")} description={uiCopy("ux.copyafc7ceb07d")} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{uiCopy("ux.copy3f9f0f1f38")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{uiCopy("ux.copy7cbc093002")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={uiCopy("ux.copy47ab900319")}
                maxLength={44}
              />
            </div>
            <div className="space-y-2">
              <Label>{uiCopy("ux.copycd2f267c0d")}</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={uiCopy("ux.copy29d8a0aedf")}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">{uiCopy("ux.copyc6f35041b3")}</p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{uiCopy("ux.copy9235e58c12")}</div>
                <div className="text-xs text-muted-foreground">{uiCopy("ux.copyf041cc568b")}</div>
              </div>
              <Switch checked={sendSms} onCheckedChange={setSendSms} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t pt-3">
              <div className="text-sm text-muted-foreground">
                {uiCopy("ux.copy8b497e8a54")}{" "}
                <b className="text-foreground">{selectedStaff.length}</b>
                {uiCopy("ux.copy5a62fd50d2")}
                {sendSms ? uiCopy("ux.copyaecf3e3a33", { value0: withPhone.length }) : ""}
              </div>
              <Button
                onClick={send}
                disabled={sending || !message.trim() || selectedStaff.length === 0}
              >
                <Send className="mr-2 h-4 w-4" />
                {sending ? uiCopy("ux.copya1cdc12999") : uiCopy("ux.copy6979bfc484")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> {uiCopy("ux.copyd442a6ac55")}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(!!v)} id="all" />
              <label htmlFor="all" className="cursor-pointer">
                {uiCopy("ux.copy426ad8878a")}
              </label>
            </div>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto space-y-1">
            {staff.map((s) => {
              const hasPhone = (s.phone ?? "").replace(/[^0-9]/g, "").length >= 9;
              return (
                <label
                  key={s.id}
                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={(v) => toggleOne(s.id, !!v)}
                  />
                  <span className="min-w-0 truncate text-sm">{s.display_name}</span>
                  {hasPhone ? (
                    <span className="text-xs text-muted-foreground">{s.phone}</span>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {uiCopy("ux.copy56005390d1")}
                    </Badge>
                  )}
                </label>
              );
            })}
            {staff.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">
                {uiCopy("ux.copy9cc3d9dd53")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{uiCopy("ux.copy578d9de4c5")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiCopy("ux.copyabfcf6cff0")}</TableHead>
                <TableHead>{uiCopy("ux.copy078b3a1b0a")}</TableHead>
                <TableHead>{uiCopy("ux.copy8a0c65f9e1")}</TableHead>
                <TableHead className="text-right">{uiCopy("ux.copy468266d639")}</TableHead>
                <TableHead className="text-right">{uiCopy("ux.copy9e10d4517d")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(h.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{h.title ?? "-"}</TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                    {h.message}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setDetailNoti(h)}
                    >
                      <Eye className="h-3 w-3" />
                      {h.acked}/{h.total}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {h.sms_ok > 0 ? (
                      <span className="text-emerald-600">
                        {uiCopy("ux.copy23b6441130")} {h.sms_ok}
                      </span>
                    ) : null}
                    {h.sms_fail > 0 ? (
                      <span className="ml-2 text-red-600">
                        {uiCopy("ux.copy732fe33ab1")} {h.sms_fail}
                      </span>
                    ) : null}
                    {h.sms_ok === 0 && h.sms_fail === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    {uiCopy("ux.copy688f0e9740")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detailNoti} onOpenChange={(open) => !open && setDetailNoti(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{uiCopy("ux.copy87091b0ede")}</DialogTitle>
            <DialogDescription>
              {detailNoti ? (
                <>
                  {new Date(detailNoti.created_at).toLocaleString()} ·{" "}
                  {detailNoti.title ?? uiCopy("ux.copy79500c9b6b")}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {detailNoti ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-emerald-50 px-3 py-1 text-emerald-700">
                  {uiCopy("ux.copy7331dcc71c")} {detailNoti.acked}
                  {uiCopy("ux.copy5a62fd50d2")}
                </div>
                <div className="rounded-md bg-red-50 px-3 py-1 text-red-700">
                  {uiCopy("ux.copy46bf0c9447")} {detailNoti.total - detailNoti.acked}
                  {uiCopy("ux.copy5a62fd50d2")}
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uiCopy("ux.copycee097c09f")}</TableHead>
                      <TableHead className="text-right">{uiCopy("ux.copy2926977ba7")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailNoti.recipients
                      .filter((r) => !r.acknowledged_at)
                      .map((r) => (
                        <TableRow key={r.user_id}>
                          <TableCell className="text-sm font-medium">{r.display_name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="destructive" className="text-xs">
                              {uiCopy("ux.copy46a79618eb")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {detailNoti.recipients.filter((r) => !r.acknowledged_at).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="p-4 text-center text-sm text-muted-foreground"
                        >
                          {uiCopy("ux.copy19edd1e4d9")}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
