import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type Ingest = {
  id: string;
  received_at: string;
  raw_body: unknown;
  employee_phone: string | null;
  customer_phone: string | null;
  direction: string | null;
  status: string | null;
  duration: number | null;
  started_at: string | null;
  parse_ok: boolean;
  error_reason: string | null;
  matched_employee_id: string | null;
  phone_call_log_id: string | null;
};

/** 한국 시간(KST, +09:00) 기준 표기 */
export function formatKst(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(d);
}

export function CallLogIngestPanel() {
  const qc = useQueryClient();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [linkRow, setLinkRow] = useState<Ingest | null>(null);
  const [linkStaff, setLinkStaff] = useState<string>("");
  const [detail, setDetail] = useState<Ingest | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["call_log_ingest", onlyProblems],
    queryFn: async () => {
      let q = (supabase.from("call_log_ingest" as any) as any)
        .select("*")
        .order("received_at", { ascending: false })
        .limit(200);
      if (onlyProblems) q = q.or("parse_ok.eq.false,matched_employee_id.is.null");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Ingest[];
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["profiles-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, phone")
        .eq("is_active", true)
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const problemCount = useMemo(
    () => (data ?? []).filter((r) => !r.parse_ok || !r.matched_employee_id).length,
    [data],
  );

  async function saveLink() {
    if (!linkRow || !linkStaff) return;
    const { error } = await (supabase.from("call_log_ingest" as any) as any)
      .update({ matched_employee_id: linkStaff, error_reason: null })
      .eq("id", linkRow.id);
    if (error) { toast.error(error.message); return; }
    if (linkRow.phone_call_log_id) {
      await supabase
        .from("phone_call_logs")
        .update({ staff_id: linkStaff })
        .eq("id", linkRow.phone_call_log_id);
    }
    toast.success("직원을 연결했습니다.");
    setLinkRow(null);
    setLinkStaff("");
    qc.invalidateQueries({ queryKey: ["call_log_ingest"] });
    qc.invalidateQueries({ queryKey: ["phone_call_logs"] });
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">수신 원시 로그 (Automate 진단)</h2>
          <p className="text-xs text-muted-foreground">
            API가 실제로 받은 요청 원문입니다. 여기 없으면 휴대폰에서 요청이 오지 않은 것입니다.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {problemCount > 0 && (
            <Badge variant="outline" className="gap-1 border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              <AlertTriangle className="h-3 w-3" /> 문제 {problemCount}건
            </Badge>
          )}
          <Button variant={onlyProblems ? "default" : "outline"} size="sm" onClick={() => setOnlyProblems((v) => !v)}>
            문제 건만 보기
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>수신 시각 (KST)</TableHead>
            <TableHead>통화 시각 (KST)</TableHead>
            <TableHead>직원 번호</TableHead>
            <TableHead>고객 번호</TableHead>
            <TableHead>방향/상태</TableHead>
            <TableHead className="text-right">통화(초)</TableHead>
            <TableHead>결과</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : !data || data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                수신된 요청이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatKst(r.received_at)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{formatKst(r.started_at)}</TableCell>
                <TableCell className="font-mono text-xs">{r.employee_phone ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.customer_phone ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.direction ?? "—"}{r.status ? ` / ${r.status}` : ""}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.duration ?? 0}</TableCell>
                <TableCell className="text-xs">
                  {!r.parse_ok ? (
                    <Badge variant="outline" className="border-transparent bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                      저장 실패
                    </Badge>
                  ) : !r.matched_employee_id ? (
                    <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                      직원 미매칭
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      정상
                    </Badge>
                  )}
                  {r.error_reason && (
                    <div className="mt-1 max-w-[220px] truncate text-[11px] text-muted-foreground" title={r.error_reason}>
                      {r.error_reason}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>원문</Button>
                  {!r.matched_employee_id && (
                    <Button variant="ghost" size="sm" onClick={() => { setLinkRow(r); setLinkStaff(""); }}>
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>수신 원문</DialogTitle></DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(detail?.raw_body ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkRow} onOpenChange={(o) => !o && setLinkRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>직원 수동 연결</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              번호 {linkRow?.employee_phone ?? "—"} 의 통화를 연결할 직원을 선택하세요.
            </p>
            <Select value={linkStaff} onValueChange={setLinkStaff}>
              <SelectTrigger><SelectValue placeholder="직원 선택" /></SelectTrigger>
              <SelectContent>
                {(staff ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.display_name}{s.phone ? ` (${s.phone})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkRow(null)}>취소</Button>
            <Button onClick={saveLink} disabled={!linkStaff}>연결</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
