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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bell, Send, Users, Eye } from "lucide-react";
import i18n from "@/i18n";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "관리자 공지 · Hanpass Mobile OB CRM" },
      { name: "description", content: "관리자가 직원에게 공지 팝업과 SMS를 발송합니다." },
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
    if (!message.trim()) return toast.error("메시지를 입력해주세요");
    if (selectedStaff.length === 0) return toast.error("수신 직원을 선택해주세요");
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
        const receivers = withPhone.map((s) => ({ name: s.display_name, phone: s.phone!.replace(/[^0-9]/g, "") }));
        const { data: smsRes, error: sErr } = await supabase.functions.invoke("send-sms", {
          body: { receivers, message: smsText, title: title.trim() || "공지" },
        });
        if (sErr) {
          smsInfo = ` (SMS 실패: ${sErr.message})`;
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
          smsInfo = ok ? ` · SMS ${withPhone.length}건 발송` : ` (SMS 실패)`;
        }
        const skipped = selectedStaff.length - withPhone.length;
        if (skipped > 0) smsInfo += ` · 번호 없음 ${skipped}명 스킵`;
      }

      toast.success(`${selectedStaff.length}명에게 공지 발송 완료${smsInfo}`);
      setTitle("");
      setMessage("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["noti-history"] });
    } catch (e: any) {
      toast.error(`발송 실패: ${e?.message ?? e}`);
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="관리자 공지" description="관리자만 접근할 수 있습니다." />
      </div>
    );
  }

  const allSelected = staff.length > 0 && selected.size === staff.length;

  return (
    <div className="space-y-4">
      <PageHeader title="관리자 공지" description="직원에게 팝업 공지와 업무폰 SMS를 함께 발송합니다." />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">새 공지 작성</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>제목 (선택)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 긴급 회의" maxLength={44} />
            </div>
            <div className="space-y-2">
              <Label>내용 *</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="직원에게 전달할 내용을 입력하세요"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                직원 화면에 큰 팝업으로 표시되며, 확인 버튼을 눌러야 닫힙니다.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">업무폰 SMS도 함께 전송</div>
                <div className="text-xs text-muted-foreground">등록된 전화번호가 있는 직원에게만 발송됩니다.</div>
              </div>
              <Switch checked={sendSms} onCheckedChange={setSendSms} />
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-sm text-muted-foreground">
                선택: <b className="text-foreground">{selectedStaff.length}</b>명
                {sendSms ? ` · SMS 대상 ${withPhone.length}명` : ""}
              </div>
              <Button onClick={send} disabled={sending || !message.trim() || selectedStaff.length === 0}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? "발송 중..." : "발송"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> 수신 직원
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(!!v)} id="all" />
              <label htmlFor="all" className="cursor-pointer">전직원 선택</label>
            </div>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto space-y-1">
            {staff.map((s) => {
              const hasPhone = (s.phone ?? "").replace(/[^0-9]/g, "").length >= 9;
              return (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => toggleOne(s.id, !!v)} />
                  <span className="flex-1 text-sm">{s.display_name}</span>
                  {hasPhone ? (
                    <span className="text-xs text-muted-foreground">{s.phone}</span>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">번호 없음</Badge>
                  )}
                </label>
              );
            })}
            {staff.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">활성 직원이 없습니다.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">발송 이력 (최근 50건)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>일시</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>내용</TableHead>
                <TableHead className="text-right">확인</TableHead>
                <TableHead className="text-right">SMS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(h.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{h.title ?? "-"}</TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">{h.message}</TableCell>
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
                    {h.sms_ok > 0 ? <span className="text-emerald-600">성공 {h.sms_ok}</span> : null}
                    {h.sms_fail > 0 ? <span className="ml-2 text-red-600">실패 {h.sms_fail}</span> : null}
                    {h.sms_ok === 0 && h.sms_fail === 0 ? <span className="text-muted-foreground">-</span> : null}
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    발송 이력이 없습니다.
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
            <DialogTitle>확인 현황 · Acknowledgement Status</DialogTitle>
            <DialogDescription>
              {detailNoti ? (
                <>
                  {new Date(detailNoti.created_at).toLocaleString()} · {detailNoti.title ?? "관리자 공지"}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {detailNoti ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="rounded-md bg-emerald-50 px-3 py-1 text-emerald-700">
                  확인 완료: {detailNoti.acked}명
                </div>
                <div className="rounded-md bg-red-50 px-3 py-1 text-red-700">
                  미확인: {detailNoti.total - detailNoti.acked}명
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>직원</TableHead>
                      <TableHead className="text-right">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailNoti.recipients
                      .filter((r) => !r.acknowledged_at)
                      .map((r) => (
                        <TableRow key={r.user_id}>
                          <TableCell className="text-sm font-medium">{r.display_name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="destructive" className="text-xs">미확인</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {detailNoti.recipients.filter((r) => !r.acknowledged_at).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="p-4 text-center text-sm text-muted-foreground">
                          모두 확인했습니다. All acknowledged.
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
