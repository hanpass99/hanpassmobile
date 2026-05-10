import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, UserX, UserCheck, UserPlus, KeyRound, Copy, Mail, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 — Hanpass OB CRM" }] }),
  component: Settings,
});

type Country = { id: string; code: string; name_ko: string };
type Row = {
  id: string;
  display_name: string;
  department: string | null;
  is_active: boolean;
  role: "admin" | "staff";
  country_id: string | null;
  call_target: number;
  activation_target: number;
};

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth() + 1;

function Settings() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkCall, setBulkCall] = useState(200);
  const [bulkAct, setBulkAct] = useState(120);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<Row | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; tempPassword: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  const resetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("admin-reset-staff-password", {
      body: { user_id: resetTarget.id },
    });
    setResetting(false);
    if (error || (data as any)?.error) {
      return toast.error(`초기화 실패: ${(data as any)?.error ?? error?.message}`);
    }
    setResetResult({ name: resetTarget.display_name, tempPassword: (data as any).temp_password });
    setResetTarget(null);
    toast.success("임시 비밀번호 발급됨");
  };

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: targets }, { data: co }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, department, is_active, country_id"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("targets").select("user_id, call_target, activation_target").eq("year", Y).eq("month", M),
      supabase.from("countries").select("id, code, name_ko").order("code"),
    ]);
    const merged: Row[] = (profiles ?? []).map((p: any) => {
      const r = roles?.find((x) => x.user_id === p.id);
      const t = targets?.find((x) => x.user_id === p.id);
      return {
        id: p.id,
        display_name: p.display_name,
        department: p.department,
        is_active: p.is_active,
        role: (r?.role as "admin" | "staff") ?? "staff",
        country_id: p.country_id ?? null,
        call_target: t?.call_target ?? 0,
        activation_target: t?.activation_target ?? 0,
      };
    });
    setRows(merged);
    setCountries(co ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveTarget = async (r: Row) => {
    const { error } = await supabase.from("targets").upsert(
      { user_id: r.id, year: Y, month: M, call_target: r.call_target, activation_target: r.activation_target },
      { onConflict: "user_id,year,month" }
    );
    if (error) { toast.error(`목표 저장 실패: ${error.message}`); return; }
    toast.success(`${r.display_name} 목표 저장됨`);
  };

  const setActive = async (r: Row, active: boolean) => {
    const { error } = await supabase.rpc("admin_set_profile_active", { _user_id: r.id, _active: active });
    if (error) { toast.error(`실패: ${error.message}`); return; }
    toast.success(active ? "활성화됨" : "비활성화됨");
    load();
  };

  const setRole = async (r: Row, role: "admin" | "staff") => {
    const { error } = await supabase.rpc("admin_set_user_role", { _user_id: r.id, _role: role });
    if (error) { toast.error(`실패: ${error.message}`); return; }
    toast.success("역할 변경됨");
    load();
  };

  const setCountry = async (r: Row, country_id: string | null) => {
    const { error } = await supabase.rpc("admin_set_profile_country", {
      _user_id: r.id,
      _country_id: country_id as any,
    });
    if (error) { toast.error(`실패: ${error.message}`); return; }
    toast.success("담당 국가 변경됨");
    load();
  };

  const bulkApply = async () => {
    const payload = rows
      .filter((r) => r.is_active && r.role === "staff")
      .map((r) => ({ user_id: r.id, year: Y, month: M, call_target: bulkCall, activation_target: bulkAct }));
    if (!payload.length) return toast.info("적용할 직원이 없습니다");
    const { error } = await supabase.from("targets").upsert(payload, { onConflict: "user_id,year,month" });
    if (error) return toast.error(`실패: ${error.message}`);
    toast.success(`${payload.length}명에게 일괄 적용됨`);
    load();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="설정" description="내 계정 · 직원 계정 · 월 목표 관리" />

      {/* 내 계정 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>내 계정 정보</CardTitle>
          <CardDescription>현재 로그인한 사용자 정보</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> 이메일 (아이디)
              </div>
              <div className="mt-1 truncate text-sm font-semibold">{user?.email ?? "-"}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" /> 권한
              </div>
              <div className="mt-1 text-sm font-semibold">{isAdmin ? "관리자" : "직원"}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> 최근 접속 시간
              </div>
              <div className="mt-1 text-sm font-semibold">
                {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("ko-KR") : "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-muted-foreground">
            관리자만 직원과 목표를 수정할 수 있습니다. 현재 보기 전용 모드입니다.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>직원 계정 관리</CardTitle>
            <CardDescription>
              {Y}년 {M}월 기준. 직원은 본인 담당 국가의 고객만 조회할 수 있습니다.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> 직원 추가
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> 새로고침
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>이름</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>담당 국가</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-28">콜 목표</TableHead>
                <TableHead className="w-28">개통 목표</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.is_active ? "" : "opacity-50"}>
                  <TableCell className="font-medium">
                    {r.display_name}
                    {r.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(나)</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.department ?? "-"}</TableCell>
                  <TableCell>
                    {isAdmin && r.id !== user?.id ? (
                      <Select value={r.role} onValueChange={(v) => setRole(r, v as "admin" | "staff")}>
                        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">관리자</SelectItem>
                          <SelectItem value="staff">직원</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={r.role === "admin" ? "default" : "secondary"}>
                        {r.role === "admin" ? "관리자" : "직원"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={r.country_id ?? "__all__"}
                        onValueChange={(v) => setCountry(r, v === "__all__" ? null : v)}
                      >
                        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="전체" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">전체 (제한 없음)</SelectItem>
                          {countries.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {countries.find((c) => c.id === r.country_id)?.name_ko ?? "전체"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "outline"}>
                      {r.is_active ? "활성" : "비활성"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={r.call_target}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setRows((p) => p.map((x) => (x.id === r.id ? { ...x, call_target: Number(e.target.value) } : x)))
                      }
                      className="h-8 w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={r.activation_target}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setRows((p) => p.map((x) => (x.id === r.id ? { ...x, activation_target: Number(e.target.value) } : x)))
                      }
                      className="h-8 w-20"
                    />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => saveTarget(r)}>저장</Button>
                        {r.id !== user?.id && (
                          r.is_active ? (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setActive(r, false)}>
                              <UserX className="mr-1 h-3.5 w-3.5" /> 비활성
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setActive(r, true)}>
                              <UserCheck className="mr-1 h-3.5 w-3.5" /> 활성
                            </Button>
                          )
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">직원이 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>월간 목표 일괄 설정</CardTitle>
            <CardDescription>{Y}년 {M}월 — 활성 직원 전체에 동일 목표 적용</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bcall">콜 목표 (건)</Label>
                <Input id="bcall" type="number" value={bulkCall} onChange={(e) => setBulkCall(Number(e.target.value))} className="w-32" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bact">개통 목표 (건)</Label>
                <Input id="bact" type="number" value={bulkAct} onChange={(e) => setBulkAct(Number(e.target.value))} className="w-32" />
              </div>
              <Button onClick={bulkApply}>
                <Plus className="mr-2 h-4 w-4" /> 일괄 적용
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <CreateStaffDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={load}
        countries={countries}
      />
    </div>
  );
}

function CreateStaffDialog({
  open, onClose, onCreated, countries,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  countries: Country[];
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [countryId, setCountryId] = useState<string>("__all__");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(""); setPassword(""); setDisplayName(""); setDepartment("");
      setCountryId("__all__"); setRole("staff");
    }
  }, [open]);

  const submit = async () => {
    if (!email || !password || !displayName) return toast.error("이메일, 비밀번호, 이름은 필수입니다");
    if (password.length < 6) return toast.error("비밀번호는 최소 6자 이상이어야 합니다");
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-staff", {
      body: {
        email, password,
        display_name: displayName,
        department: department || undefined,
        country_id: countryId === "__all__" ? undefined : countryId,
        role,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      return toast.error(`생성 실패: ${(data as any)?.error ?? error?.message}`);
    }
    toast.success(`${displayName} 계정이 생성되었습니다`);
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>직원 계정 추가</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 space-y-2">
            <Label>이메일 *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>비밀번호 * (최소 6자)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>이름 *</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>부서</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>역할</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">직원</SelectItem>
                <SelectItem value="admin">관리자</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>담당 국가</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체 (제한 없음)</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.code} · {c.name_ko}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "생성 중..." : "계정 생성"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
