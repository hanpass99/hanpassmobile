import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MessageSquare, Send, FileText, History, Plus, Trash2, Edit3, Search, Users as UsersIcon } from "lucide-react";
import { format } from "date-fns";
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
  const [tab, setTab] = useState("send");
  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="문자 발송"
        description="고객에게 SMS/LMS 발송 · 템플릿 관리 · 발송 내역"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="send"><Send className="mr-1 h-4 w-4" />보내기</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="mr-1 h-4 w-4" />내 템플릿</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />발송 내역</TabsTrigger>
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
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pickTpl, setPickTpl] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [manualPhones, setManualPhones] = useState("");

  useEffect(() => {
    void loadCustomers();
    void loadTemplates();
  }, []);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,phone,status,country_id")
      .order("imported_at", { ascending: false })
      .limit(500);
    if (error) toast.error("고객 로드 실패: " + error.message);
    else setCustomers((data as Customer[]) || []);
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from("sms_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setTemplates((data as Template[]) || []);
  }

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
    const t = templates.find((x) => x.id === id);
    if (t) {
      setMessage(t.content);
      if (t.title) setTitle(t.title);
    }
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  }

  async function send() {
    if (!user) return;
    if (!message.trim()) { toast.error("메시지를 입력하세요"); return; }

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

    if (recv.length === 0) { toast.error("수신자를 선택하거나 번호를 입력하세요"); return; }
    if (isLms && !title.trim()) { toast.error("LMS는 제목이 필요합니다 (44자 이내)"); return; }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: { receivers: recv, message, title: title || undefined },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast.success(`발송 완료 (${(data as any).msg_type} · ${(data as any).count}건)`);
        setSelected(new Set());
        setMessage("");
        setTitle("");
        setManualPhones("");
        setPickTpl("");
      } else {
        toast.error(`발송 실패: ${(data as any)?.aligo?.message || JSON.stringify((data as any)?.aligo)}`);
      }
    } catch (e) {
      toast.error("발송 실패: " + (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr,420px]">
      {/* Receivers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> 수신자 선택
            <Badge variant="secondary" className="ml-2">선택 {selected.size}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="이름 / 번호 검색"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="new">미시작</SelectItem>
                <SelectItem value="in_progress">진행중</SelectItem>
                <SelectItem value="callback">재연락</SelectItem>
                <SelectItem value="no_answer">부재중</SelectItem>
                <SelectItem value="activated">개통완료</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded border max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>전화번호</TableHead>
                  <TableHead>상태</TableHead>
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
                    검색 결과가 없습니다
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <Label className="text-xs">추가 수신 번호 (직접 입력 — 줄바꿈/콤마 구분)</Label>
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
          <CardTitle className="text-base">메시지 작성</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">템플릿 불러오기</Label>
            <Select value={pickTpl} onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue placeholder="템플릿 선택 (선택사항)" /></SelectTrigger>
              <SelectContent>
                {templates.length === 0 && (
                  <SelectItem value="__none" disabled>저장된 템플릿이 없습니다</SelectItem>
                )}
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}{t.is_shared ? " (공유)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLms && (
            <div>
              <Label className="text-xs">제목 (LMS, 44자 이내)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={44} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">내용</Label>
              <span className={`text-[11px] ${isLms ? "text-orange-500" : "text-muted-foreground"}`}>
                {bytes} bytes · {isLms ? "LMS (장문)" : "SMS (단문 ≤90)"}
              </span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="발송할 메시지를 입력하세요"
              className="h-44"
            />
          </div>

          <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            ⚠️ 발신번호는 알리고 등록된 번호로 자동 사용됩니다.<br />
            💡 90바이트 초과 시 자동으로 LMS로 발송됩니다.
          </div>

          <Button onClick={send} disabled={sending} className="w-full">
            <Send className="mr-2 h-4 w-4" />
            {sending ? "발송 중..." : `${selected.size + (manualPhones.trim() ? manualPhones.split(/[\n,;]+/).filter(Boolean).length : 0)}명에게 발송`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============== TEMPLATES TAB ============== */
function TemplatesTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ title: "", content: "", is_shared: false });

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data, error } = await supabase
      .from("sms_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("로드 실패: " + error.message);
    else setItems((data as Template[]) || []);
  }

  function startNew() {
    setEditing(null);
    setForm({ title: "", content: "", is_shared: false });
    setOpen(true);
  }
  function startEdit(t: Template) {
    setEditing(t);
    setForm({ title: t.title, content: t.content, is_shared: t.is_shared });
    setOpen(true);
  }

  async function save() {
    if (!user) return;
    if (!form.title.trim() || !form.content.trim()) { toast.error("제목과 내용은 필수"); return; }
    if (editing) {
      const { error } = await supabase.from("sms_templates")
        .update({ title: form.title, content: form.content, is_shared: form.is_shared })
        .eq("id", editing.id);
      if (error) return toast.error("수정 실패: " + error.message);
      toast.success("수정됨");
    } else {
      const { error } = await supabase.from("sms_templates")
        .insert({ user_id: user.id, title: form.title, content: form.content, is_shared: form.is_shared });
      if (error) return toast.error("저장 실패: " + error.message);
      toast.success("저장됨");
    }
    setOpen(false);
    void load();
  }

  async function remove(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    const { error } = await supabase.from("sms_templates").delete().eq("id", id);
    if (error) return toast.error("삭제 실패: " + error.message);
    toast.success("삭제됨");
    void load();
  }

  const mine = items.filter((t) => t.user_id === user?.id);
  const shared = items.filter((t) => t.user_id !== user?.id && t.is_shared);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">템플릿 ({items.length})</CardTitle>
        <Button size="sm" onClick={startNew}><Plus className="mr-1 h-4 w-4" />새 템플릿</Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-2 text-sm font-medium">내 템플릿 ({mine.length})</h4>
          <TemplateList items={mine} onEdit={startEdit} onDelete={remove} editable />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">동료 공유 템플릿 ({shared.length})</h4>
          <TemplateList items={shared} onEdit={() => {}} onDelete={() => {}} editable={false} />
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "템플릿 수정" : "새 템플릿"}</DialogTitle>
            <DialogDescription>자주 사용하는 메시지를 저장해두세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>제목</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>내용</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="h-40"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                {byteLength(form.content)} bytes · {byteLength(form.content) > 90 ? "LMS" : "SMS"}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_shared} onCheckedChange={(v) => setForm({ ...form, is_shared: !!v })} />
              동료에게 공유 (모든 직원이 볼 수 있음)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={save}>저장</Button>
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
  onEdit: (t: Template) => void;
  onDelete: (id: string) => void;
  editable: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">템플릿이 없습니다</p>;
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((t) => (
        <div key={t.id} className="rounded border p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm">{t.title}</div>
            <div className="flex gap-1">
              {t.is_shared && <Badge variant="secondary" className="text-[10px]">공유</Badge>}
              {editable && (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(t)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{t.content}</p>
          <div className="text-[10px] text-muted-foreground">
            {byteLength(t.content)} bytes · {byteLength(t.content) > 90 ? "LMS" : "SMS"}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============== HISTORY TAB ============== */
function HistoryTab() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState<SmsLog | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_logs")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(500);
    if (error) toast.error("내역 로드 실패: " + error.message);
    else setLogs((data as SmsLog[]) || []);
    setLoading(false);
  }

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
        <CardTitle className="text-base">발송 내역 ({filtered.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="이름 / 번호 / 내용 검색"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="sent">성공</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load}>새로고침</Button>
        </div>

        <div className="rounded border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>발송 시각</TableHead>
                <TableHead>받는 사람</TableHead>
                <TableHead>번호</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">발송 내역이 없습니다</TableCell></TableRow>
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
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">성공</Badge>
                    ) : (
                      <Badge variant="destructive">실패</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>발송 상세</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">받는 사람</Label><div>{detail.receiver_name || "-"}</div></div>
                <div><Label className="text-xs">번호</Label><div className="font-mono">{detail.receiver_phone}</div></div>
                <div><Label className="text-xs">유형</Label><div>{detail.msg_type}</div></div>
                <div><Label className="text-xs">상태</Label><div>{detail.status}</div></div>
                <div className="col-span-2"><Label className="text-xs">발송 시각</Label>
                  <div>{format(new Date(detail.sent_at), "yyyy-MM-dd HH:mm:ss")}</div></div>
                {detail.title && (
                  <div className="col-span-2"><Label className="text-xs">제목</Label><div>{detail.title}</div></div>
                )}
              </div>
              <div>
                <Label className="text-xs">내용</Label>
                <div className="rounded border p-2 bg-muted/30 whitespace-pre-wrap text-xs">{detail.message}</div>
              </div>
              {detail.error_message && (
                <div>
                  <Label className="text-xs text-destructive">오류</Label>
                  <div className="rounded border border-destructive/30 p-2 bg-destructive/10 text-xs">{detail.error_message}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
