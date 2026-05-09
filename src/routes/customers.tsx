import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Upload, Search, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  CHANNELS,
  COUNTRIES,
  CUSTOMERS,
  STAFF,
  STATUSES,
  type Status,
} from "@/lib/mock-data";
import { CallUpdateDialog } from "@/components/CallUpdateDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "고객 관리 — Hanpass OB CRM" }] }),
  component: CustomersPage,
});

const statusVariant: Record<Status, string> = {
  미처리: "bg-muted text-muted-foreground",
  처리중: "bg-info/15 text-info",
  "재연락 필요": "bg-warning/20 text-warning-foreground",
  "개통 처리 중": "bg-primary-soft text-primary",
  "개통 완료": "bg-success/15 text-success",
  거부: "bg-muted text-muted-foreground",
  실패: "bg-destructive/15 text-destructive",
};

function CustomersPage() {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [channel, setChannel] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return CUSTOMERS.filter((c) => {
      if (search && !`${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (country !== "all" && c.country !== country) return false;
      if (channel !== "all" && c.channel !== channel) return false;
      if (staffId !== "all" && c.assignedStaffId !== staffId) return false;
      if (status !== "all" && c.status !== status) return false;
      return true;
    }).slice(0, 100);
  }, [search, country, channel, staffId, status]);

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="고객 관리"
        description={`총 ${CUSTOMERS.length.toLocaleString()}명의 고객`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => toast.success("Excel 가져오기 (목업)")}>
              <Upload className="mr-2 h-4 w-4" />
              가져오기
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.success("Excel 내보내기 (목업)")}>
              <Download className="mr-2 h-4 w-4" />
              내보내기
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="이름 또는 전화번호 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue placeholder="국가" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 국가</SelectItem>
                {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue placeholder="채널" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 채널</SelectItem>
                {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="담당자" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 담당자</SelectItem>
                {STAFF.filter((s) => s.role === "staff").map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="상태" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm">
              <span className="font-medium text-primary">{selected.size}명 선택됨</span>
              <Button size="sm" variant="outline" onClick={() => toast.success("일괄 담당자 배정 (목업)")}>
                <UserCheck className="mr-2 h-4 w-4" /> 담당자 배정
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast.success("일괄 상태 변경 (목업)")}>
                상태 변경
              </Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>고객명</TableHead>
                  <TableHead>전화번호</TableHead>
                  <TableHead>국가</TableHead>
                  <TableHead>채널</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>콜 결과</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>최근 콜</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const staff = STAFF.find((s) => s.id === c.assignedStaffId);
                  return (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell>
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                      <TableCell>{c.country}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{c.channel}</TableCell>
                      <TableCell className="text-xs">{staff?.name ?? "-"}</TableCell>
                      <TableCell className="text-xs">{c.callResult ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusVariant[c.status]}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.callDate ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c.id)}>
                          업데이트
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      조건에 맞는 고객이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length === 100 && (
            <p className="text-center text-xs text-muted-foreground">상위 100건만 표시됩니다. 필터를 적용하세요.</p>
          )}
        </CardContent>
      </Card>

      <CallUpdateDialog customerId={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
