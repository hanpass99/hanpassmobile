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
import { Plus, RefreshCw, UserX, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 — Hanpass OB CRM" }] }),
  component: Settings,
});

type Row = {
  id: string;
  display_name: string;
  department: string | null;
  is_active: boolean;
  role: "admin" | "staff";
  call_target: number;
  activation_target: number;
};

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth() + 1;

function Settings() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkCall, setBulkCall] = useState(200);
  const [bulkAct, setBulkAct] = useState(120);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: targets }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, department, is_active"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("targets").select("user_id, call_target, activation_target").eq("year", Y).eq("month", M),
    ]);
    const merged: Row[] = (profiles ?? []).map((p) => {
      const r = roles?.find((x) => x.user_id === p.id);
      const t = targets?.find((x) => x.user_id === p.id);
      return {
        id: p.id,
        display_name: p.display_name,
        department: p.department,
        is_active: p.is_active,
        role: (r?.role as "admin" | "staff") ?? "staff",
        call_target: t?.call_target ?? 0,
        activation_target: t?.activation_target ?? 0,
      };
    });
    setRows(merged);
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
      <PageHeader title="설정" description="직원 계정 및 월 목표 관리" />

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
              {Y}년 {M}월 기준. 신규 직원은 <code>/auth</code> 회원가입 후 자동으로 표시됩니다.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> 새로고침
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>이름</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-32">콜 목표</TableHead>
                <TableHead className="w-32">개통 목표</TableHead>
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
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
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
                      className="h-8 w-24"
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
                      className="h-8 w-24"
                    />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => saveTarget(r)}>저장</Button>
                        {r.id !== user?.id && (
                          r.is_active ? (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setActive(r, false)}>
                              <UserX className="mr-1 h-3.5 w-3.5" /> 비활성화
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setActive(r, true)}>
                              <UserCheck className="mr-1 h-3.5 w-3.5" /> 활성화
                            </Button>
                          )
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">직원이 없습니다.</TableCell></TableRow>
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
    </div>
  );
}
