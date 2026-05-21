import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MessageSquare, Send, FileText, History, Plus, Trash2, Edit3, Search, Users as UsersIcon } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  useSmsCustomers, useSmsTemplates, useSmsLogs,
  useInvalidateSmsTemplates, useSendSms,
  type SmsTemplate as Template, type SmsLog,
} from "@/hooks/use-sms";

export const Route = createFileRoute("/sms")({
  head: () => ({ meta: [{ title: "문자 발송 — Hanpass OB CRM" }] }),
  component: SmsPage,
});

function byteLength(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 127 ? 2 : 1;
  return n;
}


function SmsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("send");
  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={t("sms.title")}
        description={t("sms.subtitle")}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="send"><Send className="mr-1 h-4 w-4" />{t("sms.tabs.send")}</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="mr-1 h-4 w-4" />{t("sms.tabs.templates")}</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />{t("sms.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="send" className="mt-4"><SendTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============== SEND TAB ============== */
function SendTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: customers = [] } = useSmsCustomers();
  const { data: templates = [] } = useSmsTemplates();
  const sendMutation = useSendSms();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [pickTpl, setPickTpl] = useState<string>("");
  const [manualPhones, setManualPhones] = useState("");
  const sending = sendMutation.isPending;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    });
  }, [customers, search, statusFilter]);

  const bytes = byteLength(message);
  const isLms = bytes > 90;

  function applyTemplate(id: string) {
    setPickTpl(id);
    const tpl = templates.find((x) => x.id === id);
    if (tpl) {
      setMessage(tpl.content);
      if (tpl.title) setTitle(tpl.title);
    }
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  }

  async function send() {
    if (!user) return;
    if (!message.trim()) { toast.error(t("sms.needMessage")); return; }

    const recv: { customer_id?: string | null; name?: string | null; phone: string }[] = [];
    selected.forEach((id) => {
      const c = customers.find((x) => x.id === id);
      if (c) recv.push({ customer_id: c.id, name: c.name, phone: c.phone });
    });
    manualPhones
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => recv.push({ phone: p }));

    if (recv.length === 0) { toast.error(t("sms.needReceiver")); return; }
    if (isLms && !title.trim()) { toast.error(t("sms.needTitle")); return; }

    try {
      const data = await sendMutation.mutateAsync({ receivers: recv, message, title: title || undefined });
      if (data?.ok) {
        toast.success(t("sms.sendSuccess", { type: data.msg_type, count: data.count }));
        setSelected(new Set());
        setMessage("");
        setTitle("");
        setManualPhones("");
        setPickTpl("");
      } else {
        toast.error(t("sms.sendFail", { msg: data?.aligo?.message || JSON.stringify(data?.aligo) }));
      }
    } catch (e) {
      toast.error(t("sms.sendFail", { msg: (e as Error).message }));
    }
  }

  const manualCount = manualPhones.trim() ? manualPhones.split(/[\n,;]+/).filter(Boolean).length : 0;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr,420px]">
      {/* Receivers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> {t("sms.receivers")}
            <Badge variant="secondary" className="ml-2">{t("sms.selectedCount", { count: selected.size })}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder={t("sms.searchPlaceholder")}
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sms.allStatus")}</SelectItem>
                <SelectItem value="new">{t("sms.status.new")}</SelectItem>
                <SelectItem value="in_progress">{t("sms.status.in_progress")}</SelectItem>
                <SelectItem value="callback">{t("sms.status.callback")}</SelectItem>
                <SelectItem value="no_answer">{t("sms.status.no_answer")}</SelectItem>
                <SelectItem value="activated">{t("sms.status.activated")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded border max-h-[420px] overflow-auto">
            <Table aria-label={t("sms.receivers")}>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                      aria-label={t("common.selectAll")}
                    />
                  </TableHead>
                  <TableHead>{t("sms.name")}</TableHead>
                  <TableHead>{t("sms.phone")}</TableHead>
                  <TableHead>{t("sms.statusLabel")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={(v) => {
                          const s = new Set(selected);
                          if (v) s.add(c.id); else s.delete(c.id);
                          setSelected(s);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                    <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {t("sms.noResult")}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <Label className="text-xs">{t("sms.manualPhones")}</Label>
            <Textarea
              value={manualPhones}
              onChange={(e) => setManualPhones(e.target.value)}
              placeholder="01012345678&#10;01098765432"
              className="font-mono text-sm h-20"
            />
          </div>
        </CardContent>
      </Card>

      {/* Composer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("sms.composer")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">{t("sms.loadTemplate")}</Label>
            <Select value={pickTpl} onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue placeholder={t("sms.pickTemplate")} /></SelectTrigger>
              <SelectContent>
                {templates.length === 0 && (
                  <SelectItem value="__none" disabled>{t("sms.noTemplates")}</SelectItem>
                )}
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.title}{tpl.is_shared ? t("sms.sharedTag") : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLms && (
            <div>
              <Label className="text-xs">{t("sms.titleLms")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={44} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("sms.content")}</Label>
              <span className={`text-[11px] ${isLms ? "text-orange-500" : "text-muted-foreground"}`}>
                {t("sms.bytesInfo", { bytes, type: isLms ? t("sms.typeLms") : t("sms.typeSms") })}
              </span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("sms.contentPlaceholder")}
              className="h-44"
            />
          </div>

          <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            {t("sms.senderNotice")}<br />
            {t("sms.lmsNotice")}
          </div>

          <Button onClick={send} disabled={sending} aria-busy={sending} className="w-full">
            <Send className="mr-2 h-4 w-4" />
            {sending ? t("sms.sending") : t("sms.sendBtn", { count: selected.size + manualCount })}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============== TEMPLATES TAB ============== */
function TemplatesTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: items = [] } = useSmsTemplates();
  const invalidateTemplates = useInvalidateSmsTemplates();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ title: "", content: "", is_shared: false });

  function startNew() {
    setEditing(null);
    setForm({ title: "", content: "", is_shared: false });
    setOpen(true);
  }
  function startEdit(tpl: Template) {
    setEditing(tpl);
    setForm({ title: tpl.title, content: tpl.content, is_shared: tpl.is_shared });
    setOpen(true);
  }

  async function save() {
    if (!user) return;
    if (!form.title.trim() || !form.content.trim()) { toast.error(t("sms.saveRequired")); return; }
    if (editing) {
      const { error } = await supabase.from("sms_templates")
        .update({ title: form.title, content: form.content, is_shared: form.is_shared })
        .eq("id", editing.id);
      if (error) return toast.error(t("sms.editFailed", { msg: error.message }));
      toast.success(t("sms.edited"));
    } else {
      const { error } = await supabase.from("sms_templates")
        .insert({ user_id: user.id, title: form.title, content: form.content, is_shared: form.is_shared });
      if (error) return toast.error(t("sms.saveFailed", { msg: error.message }));
      toast.success(t("sms.saved"));
    }
    setOpen(false);
    void invalidateTemplates();
  }

  async function remove(id: string) {
    if (!confirm(t("sms.confirmDelete"))) return;
    const { error } = await supabase.from("sms_templates").delete().eq("id", id);
    if (error) return toast.error(t("sms.deleteFailed", { msg: error.message }));
    toast.success(t("sms.deleted"));
    void invalidateTemplates();
  }

  const mine = items.filter((tpl) => tpl.user_id === user?.id);
  const shared = items.filter((tpl) => tpl.user_id !== user?.id && tpl.is_shared);


  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t("sms.templatesTitle", { count: items.length })}</CardTitle>
        <Button size="sm" onClick={startNew}><Plus className="mr-1 h-4 w-4" />{t("sms.newTemplate")}</Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-2 text-sm font-medium">{t("sms.myTemplates", { count: mine.length })}</h4>
          <TemplateList items={mine} onEdit={startEdit} onDelete={remove} editable />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">{t("sms.sharedTemplates", { count: shared.length })}</h4>
          <TemplateList items={shared} onEdit={() => {}} onDelete={() => {}} editable={false} />
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="sms-template-desc">
          <DialogHeader>
            <DialogTitle>{editing ? t("sms.editTitle") : t("sms.createTitle")}</DialogTitle>
            <DialogDescription id="sms-template-desc">{t("sms.formDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("sms.fieldTitle")}</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>{t("sms.fieldContent")}</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="h-40"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                {t("sms.bytesInfo", { bytes: byteLength(form.content), type: byteLength(form.content) > 90 ? "LMS" : "SMS" })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_shared} onCheckedChange={(v) => setForm({ ...form, is_shared: !!v })} />
              {t("sms.shareWithPeers")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("sms.cancel")}</Button>
            <Button onClick={save}>{t("sms.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TemplateList({
  items, onEdit, onDelete, editable,
}: {
  items: Template[];
  onEdit: (tpl: Template) => void;
  onDelete: (id: string) => void;
  editable: boolean;
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{t("sms.emptyTemplates")}</p>;
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((tpl) => (
        <div key={tpl.id} className="rounded border p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm">{tpl.title}</div>
            <div className="flex gap-1">
              {tpl.is_shared && <Badge variant="secondary" className="text-[10px]">{t("sms.sharedBadge")}</Badge>}
              {editable && (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(tpl)} aria-label={t("common.edit")}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(tpl.id)} aria-label={t("common.delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{tpl.content}</p>
          <div className="text-[10px] text-muted-foreground">
            {t("sms.bytesInfo", { bytes: byteLength(tpl.content), type: byteLength(tpl.content) > 90 ? "LMS" : "SMS" })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============== HISTORY TAB ============== */
function HistoryTab() {
  const { t } = useTranslation();
  const { data: logs = [], isLoading: loading, isFetching, refetch } = useSmsLogs();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState<SmsLog | null>(null);

  const load = () => { void refetch(); };


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (l.receiver_name || "").toLowerCase().includes(q) ||
        l.receiver_phone.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q)
      );
    });
  }, [logs, search, statusFilter]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("sms.historyTitle", { count: filtered.length })}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder={t("sms.historySearch")}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sms.historyAll")}</SelectItem>
              <SelectItem value="sent">{t("sms.historySent")}</SelectItem>
              <SelectItem value="failed">{t("sms.historyFailed")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} aria-busy={isFetching}>{t("sms.refresh")}</Button>
        </div>

        <div className="rounded border overflow-auto">
          <Table aria-label={t("sms.historyTitle", { count: filtered.length })}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sms.sentAt")}</TableHead>
                <TableHead>{t("sms.receiver")}</TableHead>
                <TableHead>{t("sms.phone")}</TableHead>
                <TableHead>{t("sms.type")}</TableHead>
                <TableHead>{t("sms.content")}</TableHead>
                <TableHead>{t("sms.statusLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("sms.loading")}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("sms.emptyHistory")}</TableCell></TableRow>
              ) : filtered.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => setDetail(l)}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(l.sent_at), "MM-dd HH:mm")}
                  </TableCell>
                  <TableCell>{l.receiver_name || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{l.receiver_phone}</TableCell>
                  <TableCell><Badge variant="outline">{l.msg_type}</Badge></TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs">{l.message}</TableCell>
                  <TableCell>
                    {l.status === "sent" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{t("sms.historySent")}</Badge>
                    ) : (
                      <Badge variant="destructive">{t("sms.historyFailed")}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent aria-describedby="sms-detail-desc">
          <DialogHeader>
            <DialogTitle>{t("sms.detailTitle")}</DialogTitle>
            <DialogDescription id="sms-detail-desc">{detail?.receiver_phone}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">{t("sms.receiver")}</Label><div>{detail.receiver_name || "-"}</div></div>
                <div><Label className="text-xs">{t("sms.phone")}</Label><div className="font-mono">{detail.receiver_phone}</div></div>
                <div><Label className="text-xs">{t("sms.type")}</Label><div>{detail.msg_type}</div></div>
                <div><Label className="text-xs">{t("sms.statusLabel")}</Label><div>{detail.status}</div></div>
                <div className="col-span-2"><Label className="text-xs">{t("sms.sentAt")}</Label>
                  <div>{format(new Date(detail.sent_at), "yyyy-MM-dd HH:mm:ss")}</div></div>
                {detail.title && (
                  <div className="col-span-2"><Label className="text-xs">{t("sms.fieldTitle")}</Label><div>{detail.title}</div></div>
                )}
              </div>
              <div>
                <Label className="text-xs">{t("sms.content")}</Label>
                <div className="rounded border p-2 bg-muted/30 whitespace-pre-wrap text-xs">{detail.message}</div>
              </div>
              {detail.error_message && (
                <div>
                  <Label className="text-xs text-destructive">{t("sms.error")}</Label>
                  <div className="rounded border border-destructive/30 p-2 bg-destructive/10 text-xs">{detail.error_message}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>{t("sms.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
