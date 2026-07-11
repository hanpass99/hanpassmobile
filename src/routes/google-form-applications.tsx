import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  syncGoogleFormApplications,
  listGoogleFormApplications,
} from "@/lib/google-form-sync.functions";

export const Route = createFileRoute("/google-form-applications")({
  head: () => ({ meta: [{ title: "구글폼 개통 신청 — Hanpass OB CRM" }] }),
  component: GoogleFormApplicationsPage,
});

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1EO-U_KC27ZTYT74R5q7sODVysiv9gyfgajDskLtX3fU/edit";

function GoogleFormApplicationsPage() {
  const listFn = useServerFn(listGoogleFormApplications);
  const syncFn = useServerFn(syncGoogleFormApplications);
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["google-form-submissions"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      if (r.inserted > 0) {
        toast.success(`${r.inserted}건 새로 등록되었습니다.`);
      } else {
        toast.info("새 응답이 없습니다.");
      }
      if (r.errors.length > 0) {
        toast.error(`${r.errors.length}건 오류: ${r.errors[0]}`);
      }
      qc.invalidateQueries({ queryKey: ["google-form-submissions"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 30초마다 자동 동기화
  useAutoSync(() => syncMut.mutate());

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="구글폼으로 개통 신청"
        description="구글폼 응답이 30초마다 자동으로 고객 목록에 등록됩니다."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={SHEET_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                시트 열기
              </a>
            </Button>
            <Button
              size="sm"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
              지금 동기화
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제출 시각</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>전화번호</TableHead>
                <TableHead>국가(폼)</TableHead>
                <TableHead>매핑 국가</TableHead>
                <TableHead>고객 등록</TableHead>
                <TableHead>동기화 시각</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    아직 응답이 없습니다. {isFetching && "확인 중..."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.timestamp_raw}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.country_raw || "-"}</TableCell>
                    <TableCell>
                      {r.country_name_ko ? (
                        <Badge variant="secondary">{r.country_name_ko}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600">미매핑</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.customer_id ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.synced_at).toLocaleString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function useAutoSync(cb: () => void) {
  // 첫 진입 시 1회 + 30초마다 백그라운드 동기화
  if (typeof window !== "undefined") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useOnMountAndInterval(cb, 30_000);
  }
}

function useOnMountAndInterval(cb: () => void, ms: number) {
  const { useEffect, useRef } = require("react") as typeof import("react");
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    ref.current();
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}
