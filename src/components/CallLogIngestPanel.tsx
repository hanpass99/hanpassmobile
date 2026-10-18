import { useTranslation } from "react-i18next";
import { uiCopy } from "@/i18n/ui-copy";
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
  useTranslation();
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
    toast.success(uiCopy("ux.copyed918137f8"));
    setLinkRow(null);
    setLinkStaff("");
    qc.invalidateQueries({ queryKey: ["call_log_ingest"] });
    qc.invalidateQueries({ queryKey: ["phone_call_logs"] });
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{uiCopy("ux.copy81aab55f5f")}</h2>
          <p className="text-xs text-muted-foreground">
            {uiCopy("ux.copy31321e466c")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {problemCount > 0 && (
            <Badge variant="outline" className="gap-1 border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              <AlertTriangle className="h-3 w-3" /> {uiCopy("ux.copy4b30e4b84a")} {problemCount}{uiCopy("ux.copyd202b4d78c")}
            </Badge>
          )}
          <Button variant={onlyProblems ? "default" : "outline"} size="sm" onClick={() => setOnlyProblems((v) => !v)}>
            {uiCopy("ux.copy0e0a945a6e")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{uiCopy("ux.copyf0be06d5f0")}</TableHead>
            <TableHead>{uiCopy("ux.copyb1a2efe73b")}</TableHead>
            <TableHead>{uiCopy("ux.copy51a817e44c")}</TableHead>
            <TableHead>{uiCopy("ux.copy664b314935")}</TableHead>
            <TableHead>{uiCopy("ux.copy0f403d6851")}</TableHead>
            <TableHead className="text-right">{uiCopy("ux.copye9ebc05c0e")}</TableHead>
            <TableHead>{uiCopy("ux.copy71d855acd9")}</TableHead>
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
                {uiCopy("ux.copy58153da218")}
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
                      {uiCopy("ux.copy5046905fde")}
                    </Badge>
                  ) : !r.matched_employee_id ? (
                    <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                      {uiCopy("ux.copy4c6b02508b")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      {uiCopy("ux.copyf6846cfc84")}
                    </Badge>
                  )}
                  {r.error_reason && (
                    <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={r.error_reason}>
                      {r.error_reason}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>{uiCopy("ux.copy8ba13a8495")}</Button>
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
          <DialogHeader><DialogTitle>{uiCopy("ux.copyb1ee0ff6eb")}</DialogTitle></DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(detail?.raw_body ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkRow} onOpenChange={(o) => !o && setLinkRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{uiCopy("ux.copy8fa3fae83b")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {uiCopy("ux.copy0eae1698d1")} {linkRow?.employee_phone ?? "—"} {uiCopy("ux.copy93f78b33bf")}
            </p>
            <Select value={linkStaff} onValueChange={setLinkStaff}>
              <SelectTrigger><SelectValue placeholder={uiCopy("ux.copy3dd4c5ecc3")} /></SelectTrigger>
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
            <Button variant="outline" onClick={() => setLinkRow(null)}>{uiCopy("ux.copy19b2d19bc1")}</Button>
            <Button onClick={saveLink} disabled={!linkStaff}>{uiCopy("ux.copy52b7ec5f76")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
