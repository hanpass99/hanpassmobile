import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Search, Plus, RefreshCw, Upload, Download, FileSpreadsheet,
  StickyNote, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  CUSTOMER_STATUSES, STATUS_LABEL, STATUS_CLASS, type CustomerStatus,
  POOLS, POOL_LABEL, POOL_SHORT, type CustomerPool,
} from "@/lib/labels";

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "고객 관리 — Hanpass OB CRM" }] }),
  component: CustomersPage,
});

type Country = { id: string; code: string; name_ko: string };
type Channel = { id: string; name: string };
type Profile = { id: string; display_name: string };
type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  country_id: string | null;
  channel_id: string | null;
  assigned_to: string | null;
  status: CustomerStatus;
  pool: CustomerPool;
  signup_date: string;
  imported_at: string;
  notes: string | null;
};

function CustomersPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<CustomerPool>("existing");

  // 필터 (Pool별 공통)
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [statusF, setStatusF] = useState<"all" | CustomerStatus>("all");

  // 메모/삭제 다이얼로그
  const [memoTarget, setMemoTarget] = useState<CustomerRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [c, co, ch, sf] = await Promise.all([
      supabase.from("customers").select("*").order("imported_at", { ascending: false }).limit(2000),
      supabase.from("countries").select("id, code, name_ko").eq("is_active", true).order("code"),
      supabase.from("channels").select("id, name").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, display_name").eq("is_active", true),
    ]);
    if (c.error) toast.error(`고객 로드 실패: ${c.error.message}`);
    setRows((c.data ?? []) as CustomerRow[]);
    setCountries(co.data ?? []);
    setChannels(ch.data ?? []);
    setStaff(sf.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const poolRows = useMemo(() => rows.filter((r) => r.pool === tab), [rows, tab]);

  const filtered = useMemo(() => poolRows.filter((r) => {
    if (search && !`${r.name} ${r.phone} ${r.email ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (country !== "all" && r.country_id !== country) return false;
    if (statusF !== "all" && r.status !== statusF) return false;
    return true;
  }), [poolRows, search, country, statusF]);

  // 원클릭 상태 변경 (트리거가 자동 담당자 지정)
  const changeStatus = async (id: string, status: CustomerStatus) => {
    const { error } = await supabase.from("customers").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`상태 변경: ${STATUS_LABEL[status]}`);
    load();
  };

  const deleteCustomer = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("customers").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) return toast.error(error.message);
    toast.success("삭제됨");
    load();
  };

  // === 엑셀 / CSV 업로드 ===
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const onUpload = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      const norm = (v: any) => String(v ?? "").trim();
      const findKey = (row: Record<string, any>, ...keys: string[]) => {
        const lower = Object.keys(row).reduce<Record<string, string>>((acc, k) => {
          acc[k.toLowerCase().trim()] = k; return acc;
        }, {});
        for (const k of keys) { if (lower[k.toLowerCase()]) return row[lower[k.toLowerCase()]]; }
        return "";
      };
      const countryByCode = new Map(countries.map((c) => [c.code.toUpperCase(), c.id]));
      const countryByName = new Map(countries.map((c) => [c.name_ko, c.id]));
      const channelByName = new Map(channels.map((c) => [c.name, c.id]));

      const seenPhones = new Set<string>();
      const existingPhones = new Set(rows.filter((r) => r.pool === tab).map((r) => r.phone));
      let dupInFile = 0, dupInDb = 0, invalid = 0;

      const payload = json
        .map((row) => {
          const name = norm(findKey(row, "name", "이름", "고객명"));
          const phone = norm(findKey(row, "phone", "전화", "전화번호", "연락처"));
          if (!name || !phone) { invalid++; return null; }
          if (seenPhones.has(phone)) { dupInFile++; return null; }
          if (existingPhones.has(phone)) { dupInDb++; return null; }
          seenPhones.add(phone);
          const email = norm(findKey(row, "email", "이메일")) || null;
          const cc = norm(findKey(row, "country", "국가", "국가코드"));
          const country_id = countryByCode.get(cc.toUpperCase()) ?? countryByName.get(cc) ?? null;
          const chName = norm(findKey(row, "channel", "채널"));
          const channel_id = channelByName.get(chName) ?? null;
          const notes = norm(findKey(row, "notes", "메모", "비고")) || null;
          return { name, phone, email, country_id, channel_id, notes, pool: tab };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (!payload.length) {
        toast.error(`업로드할 데이터가 없습니다. (중복 ${dupInFile + dupInDb}건, 누락 ${invalid}건)`);
        return;
      }

      const { error } = await supabase.from("customers").insert(payload);
      if (error) { toast.error(`업로드 실패: ${error.message}`); return; }
      toast.success(
        `${payload.length}명 추가 / 중복제거 ${dupInFile + dupInDb}건${invalid ? ` / 누락 ${invalid}건` : ""}`
      );
      load();
    } catch (e: any) {
      toast.error(`엑셀 파싱 실패: ${e.message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadSample = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 이름: "홍길동", 전화번호: "010-1234-5678", 이메일: "test@example.com", 국가: "KR", 채널: POOL_LABEL[tab], 메모: "" },
      { 이름: "김철수", 전화번호: "010-2222-3333", 이메일: "", 국가: "VN", 채널: "", 메모: "" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `샘플_${POOL_SHORT[tab]}.xlsx`);
  };

  const poolCount = (p: CustomerPool) => rows.filter((r) => r.pool === p).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="고객 관리"
        description={`총 ${rows.length.toLocaleString()}명${loading ? " · 로드 중..." : ""}`}
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> 새로고침
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as CustomerPool)}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          {POOLS.map((p) => (
            <TabsTrigger key={p} value={p} className="text-xs md:text-sm">
              {POOL_SHORT[p]} <span className="ml-1 text-muted-foreground">({poolCount(p)})</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {POOLS.map((p) => (
          <TabsContent key={p} value={p} className="mt-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{POOL_LABEL[p]}</div>
                  {isAdmin && tab === p && (
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                      />
                      <Button variant="outline" size="sm" onClick={downloadSample}>
                        <Download className="mr-2 h-4 w-4" /> 샘플
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
                        <Upload className="mr-2 h-4 w-4" /> {importing ? "업로드 중..." : "엑셀/CSV 업로드"}
                      </Button>
                      <Button size="sm" onClick={() => setShowAdd(true)}>
                        <Plus className="mr-2 h-4 w-4" /> 고객 추가
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="이름 / 전화번호 / 이메일"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue placeholder="국가" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 국가</SelectItem>
                      {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusF} onValueChange={(v) => setStatusF(v as typeof statusF)}>
                    <SelectTrigger><SelectValue placeholder="상태" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 상태</SelectItem>
                      {CUSTOMER_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>고객명</TableHead>
                        <TableHead>전화번호</TableHead>
                        <TableHead>국가</TableHead>
                        <TableHead>담당자</TableHead>
                        <TableHead className="min-w-[160px]">상태 (원클릭 변경)</TableHead>
                        <TableHead>등록</TableHead>
                        <TableHead className="text-right">액션</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => {
                        const co = countries.find((x) => x.id === c.country_id);
                        const sf = staff.find((x) => x.id === c.assigned_to);
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                            <TableCell className="text-xs">{co?.code ?? "-"}</TableCell>
                            <TableCell className="text-xs">
                              {sf?.display_name ?? <span className="text-muted-foreground">미배정</span>}
                            </TableCell>
                            <TableCell>
                              <Select value={c.status} onValueChange={(v) => changeStatus(c.id, v as CustomerStatus)}>
                                <SelectTrigger className={`h-8 w-[150px] border-0 ${STATUS_CLASS[c.status]} font-medium`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CUSTOMER_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(c.imported_at).toLocaleDateString("ko-KR")}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Button size="sm" variant="ghost" onClick={() => setMemoTarget(c)}>
                                <StickyNote className="mr-1 h-3.5 w-3.5" /> 메모
                              </Button>
                              {isAdmin && (
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(c.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 opacity-50" />
                            {loading ? "로드 중..." : `${POOL_LABEL[p]} Pool에 고객이 없습니다.`}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <MemoDialog
        customer={memoTarget}
        onClose={() => setMemoTarget(null)}
      />
      <AddCustomerDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={load}
        countries={countries}
        channels={channels}
        defaultPool={tab}
      />
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>고객 삭제</DialogTitle>
            <DialogDescription>이 고객과 관련된 모든 데이터가 삭제됩니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={deleteCustomer}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === 메모 다이얼로그 (히스토리 + 새 메모) ===
type Note = { id: string; content: string; created_at: string; author_id: string };

function MemoDialog({ customer, onClose }: { customer: CustomerRow | null; onClose: () => void }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (id: string) => {
    setLoading(true);
    const [{ data: n }, { data: p }] = await Promise.all([
      supabase.from("customer_notes").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, display_name"),
    ]);
    setNotes((n ?? []) as Note[]);
    const map: Record<string, string> = {};
    (p ?? []).forEach((x: any) => { map[x.id] = x.display_name; });
    setAuthors(map);
    setLoading(false);
  };

  useEffect(() => {
    if (customer) { setContent(""); load(customer.id); }
  }, [customer]);

  const save = async () => {
    if (!customer || !user || !content.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("customer_notes").insert({
      customer_id: customer.id,
      author_id: user.id,
      content: content.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setContent("");
    toast.success("메모 저장");
    load(customer.id);
  };

  if (!customer) return null;

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer.name} · 메모</DialogTitle>
          <DialogDescription>{customer.phone}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>새 메모</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="고객 관련 메모를 입력하세요" />
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={saving || !content.trim()}>
                {saving ? "저장 중..." : "메모 추가"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>히스토리</Label>
            <div className="max-h-[300px] space-y-2 overflow-y-auto rounded border border-border/60 p-2">
              {loading && <div className="text-center text-xs text-muted-foreground py-4">불러오는 중...</div>}
              {!loading && notes.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-4">메모 기록이 없습니다.</div>
              )}
              {notes.map((n) => (
                <div key={n.id} className="rounded bg-muted/40 p-2 text-sm">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">{authors[n.author_id] ?? "—"}</span>
                    <span>{new Date(n.created_at).toLocaleString("ko-KR")}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{n.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCustomerDialog({
  open, onClose, onAdded, countries, channels, defaultPool,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  countries: Country[];
  channels: Channel[];
  defaultPool: CustomerPool;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [countryId, setCountryId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("");
  const [pool, setPool] = useState<CustomerPool>(defaultPool);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setPhone(""); setEmail(""); setCountryId(""); setChannelId(""); setPool(defaultPool);
    }
  }, [open, defaultPool]);

  const save = async () => {
    if (!name || !phone) return toast.error("이름과 전화번호는 필수입니다");
    setSaving(true);
    const { error } = await supabase.from("customers").insert({
      name, phone, pool,
      email: email || null,
      country_id: countryId || null,
      channel_id: channelId || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("고객 추가됨");
    onAdded(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>고객 추가</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-2">
            <Label>이름 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>전화번호 *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>이메일</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Pool</Label>
            <Select value={pool} onValueChange={(v) => setPool(v as CustomerPool)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POOLS.map((p) => <SelectItem key={p} value={p}>{POOL_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>국가</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>채널</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
