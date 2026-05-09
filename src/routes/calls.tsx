import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { CallUpdateDialog } from "@/components/CallUpdateDialog";
import { Search, PhoneCall, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CALL_RESULTS, CALL_RESULT_LABEL, type CallResult, type CustomerStatus } from "@/lib/labels";
import { toast } from "sonner";

export const Route = createFileRoute("/calls")({
  head: () => ({ meta: [{ title: "콜 관리 — Hanpass OB CRM" }] }),
  component: CallsPage,
});

type CallRow = {
  id: string;
  call_date: string;
  result: CallResult;
  duration_sec: number;
  notes: string | null;
  is_activation: boolean;
  customer: { id: string; name: string; phone: string; status: CustomerStatus } | null;
  staff: { display_name: string } | null;
};

function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<"all" | CallResult>("all");
  const [editing, setEditing] = useState<CallRow["customer"] | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("call_logs")
      .select("id, call_date, result, duration_sec, notes, is_activation, customer:customers(id, name, phone, status), staff:profiles!call_logs_staff_id_fkey(display_name)")
      .order("call_date", { ascending: false })
      .limit(200);
    if (error) toast.error(`콜 로드 실패: ${error.message}`);
    setCalls((data ?? []) as unknown as CallRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // staff relation may fail (no FK named); fallback fetch profiles
  const filtered = useMemo(() =>
    calls.filter((c) => {
      if (result !== "all" && c.result !== result) return false;
      if (search && !`${c.customer?.name ?? ""}${c.customer?.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }), [calls, result, search]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="콜 관리"
        description="실행된 콜 기록을 조회하고 업데이트하세요"
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> 새로고침
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="이름 또는 전화번호" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 결과</SelectItem>
                {CALL_RESULTS.map((r) => <SelectItem key={r} value={r}>{CALL_RESULT_LABEL[r]}</SelectItem>)}
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
                  <TableHead>담당자</TableHead>
                  <TableHead>결과</TableHead>
                  <TableHead>통화시간</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.call_date).toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell className="font-medium">{c.customer?.name ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.customer?.phone ?? "-"}</TableCell>
                    <TableCell className="text-xs">{c.staff?.display_name ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={c.is_activation ? "default" : "outline"}>
                        {CALL_RESULT_LABEL[c.result]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{c.duration_sec}s</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{c.notes || "-"}</TableCell>
                    <TableCell className="text-right">
                      {c.customer && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c.customer)}>
                          <PhoneCall className="mr-1 h-3.5 w-3.5" /> 추가 콜
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      {loading ? "로드 중..." : "콜 기록이 없습니다. 고객 페이지에서 콜을 기록하세요."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CallUpdateDialog customer={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}
