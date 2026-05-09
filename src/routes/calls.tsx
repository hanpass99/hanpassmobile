import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CALL_RESULTS, CUSTOMERS, STAFF } from "@/lib/mock-data";
import { CallUpdateDialog } from "@/components/CallUpdateDialog";
import { Search, PhoneCall } from "lucide-react";

export const Route = createFileRoute("/calls")({
  head: () => ({ meta: [{ title: "콜 관리 — Hanpass OB CRM" }] }),
  component: CallsPage,
});

function CallsPage() {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);

  const calls = useMemo(() => {
    return CUSTOMERS
      .filter((c) => c.callResult)
      .filter((c) => result === "all" || c.callResult === result)
      .filter((c) => !search || `${c.name}${c.phone}`.includes(search))
      .sort((a, b) => (b.callDate ?? "").localeCompare(a.callDate ?? ""))
      .slice(0, 80);
  }, [search, result]);

  return (
    <div className="space-y-5">
      <PageHeader title="콜 관리" description="실행된 콜 기록을 조회하고 업데이트하세요" />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="이름 또는 전화번호" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 결과</SelectItem>
                {CALL_RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>일시</TableHead>
                  <TableHead>고객명</TableHead>
                  <TableHead>전화번호</TableHead>
                  <TableHead>채널</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>결과</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground">
                      {c.callDate} {c.callTime}
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate">{c.channel}</TableCell>
                    <TableCell className="text-xs">{STAFF.find((s) => s.id === c.assignedStaffId)?.name}</TableCell>
                    <TableCell><Badge variant="outline">{c.callResult}</Badge></TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{c.memo || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c.id)}>
                        <PhoneCall className="mr-1 h-3.5 w-3.5" /> 업데이트
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CallUpdateDialog customerId={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
