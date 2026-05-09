import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, UserCheck, Plus, Phone, RefreshCw } from "lucide-react";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CallUpdateDialog } from "@/components/CallUpdateDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CUSTOMER_STATUSES, STATUS_LABEL, STATUS_CLASS, type CustomerStatus } from "@/lib/labels";

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
  signup_date: string;
  notes: string | null;
};

function CustomersPage() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [channel, setChannel] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [status, setStatus] = useState<"all" | CustomerStatus>("all");
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, co, ch, sf] = await Promise.all([
      supabase.from("customers").select("*").order("imported_at", { ascending: false }).limit(500),
      supabase.from("countries").select("id, code, name_ko").order("code"),
      supabase.from("channels").select("id, name").order("name"),
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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search && !`${r.name} ${r.phone}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (country !== "all" && r.country_id !== country) return false;
      if (channel !== "all" && r.channel_id !== channel) return false;
      if (staffId !== "all" && r.assigned_to !== staffId) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [rows, search, country, channel, staffId, status]);

  const assignToMe = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("customers").update({ assigned_to: user.id }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("나에게 배정됨");
    load();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="고객 관리"
        description={`총 ${rows.length.toLocaleString()}명${loading ? " (로드 중...)" : ""}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> 새로고침
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="mr-2 h-4 w-4" /> 고객 추가
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="이름 또는 전화번호"
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
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue placeholder="채널" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 채널</SelectItem>
                {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="담당자" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 담당자</SelectItem>
                <SelectItem value="__none__">미배정</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
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
                  <TableHead>채널</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const co = countries.find((x) => x.id === c.country_id);
                  const ch = channels.find((x) => x.id === c.channel_id);
                  const sf = staff.find((x) => x.id === c.assigned_to);
                  return (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                      <TableCell>{co?.code ?? "-"}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{ch?.name ?? "-"}</TableCell>
                      <TableCell className="text-xs">{sf?.display_name ?? <span className="text-muted-foreground">미배정</span>}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_CLASS[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {!c.assigned_to && (
                          <Button size="sm" variant="ghost" onClick={() => assignToMe(c.id)}>
                            <UserCheck className="mr-1 h-3.5 w-3.5" /> 나에게
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                          <Phone className="mr-1 h-3.5 w-3.5" /> 콜 기록
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      {loading ? "로드 중..." : "조건에 맞는 고객이 없습니다. 우측 상단에서 고객을 추가하세요."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CallUpdateDialog
        customer={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <AddCustomerDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={load}
        countries={countries}
        channels={channels}
        staff={staff}
      />
    </div>
  );
}

function AddCustomerDialog({
  open, onClose, onAdded, countries, channels, staff,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  countries: Country[];
  channels: Channel[];
  staff: Profile[];
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [countryId, setCountryId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setPhone(""); setEmail(""); setCountryId(""); setChannelId(""); setAssignedTo(""); }
  }, [open]);

  const save = async () => {
    if (!name || !phone) return toast.error("이름과 전화번호는 필수입니다");
    setSaving(true);
    const { error } = await supabase.from("customers").insert({
      name, phone,
      email: email || null,
      country_id: countryId || null,
      channel_id: channelId || null,
      assigned_to: assignedTo || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("고객이 추가되었습니다");
    onAdded();
    onClose();
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
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>이메일</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
          <div className="space-y-2">
            <Label>채널</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>담당자</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="미배정" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>)}
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
