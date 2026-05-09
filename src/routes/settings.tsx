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
import { STAFF } from "@/lib/mock-data";
import { Plus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 — Hanpass OB CRM" }] }),
  component: Settings,
});

function Settings() {
  const [staff, setStaff] = useState(STAFF);

  return (
    <div className="space-y-5">
      <PageHeader title="설정" description="직원 계정 및 월 목표 관리" />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>직원 계정 관리</CardTitle>
            <CardDescription>OB 팀 직원 추가, 수정, 삭제</CardDescription>
          </div>
          <Button size="sm" onClick={() => toast.success("직원 추가 (목업)")}>
            <UserPlus className="mr-2 h-4 w-4" /> 직원 추가
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead className="w-40">월 목표</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "관리자" : "직원"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={u.monthlyTarget}
                      onChange={(e) =>
                        setStaff((prev) =>
                          prev.map((p) => (p.id === u.id ? { ...p, monthlyTarget: Number(e.target.value) } : p))
                        )
                      }
                      className="h-8 w-24"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => toast.success(`${u.name} 수정 (목업)`)}>수정</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => toast.error(`${u.name} 삭제 (목업)`)}>삭제</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>월간 목표 일괄 설정</CardTitle>
          <CardDescription>이번 달 모든 직원에게 동일 목표 적용</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk">개통 목표 (건)</Label>
              <Input id="bulk" type="number" defaultValue={120} className="w-40" />
            </div>
            <Button onClick={() => toast.success("일괄 적용 완료 (목업)")}>
              <Plus className="mr-2 h-4 w-4" /> 적용
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
