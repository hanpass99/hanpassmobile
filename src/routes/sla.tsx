import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw, Pencil, Ban, History, Clock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  useSlaAdjustments, useSlaAdminActions, useSlaRealtime,
  useSlaTeamSummary, useSlaViolations, useSlaUpcoming,
  monthStartKstIso, todayKstIso, weekStartKstIso,
  type SlaTeamRow,
} from "@/hooks/use-sla";
import { STATUS_LABEL } from "@/lib/labels";

export const Route = createFileRoute("/sla")({
  head: () => ({ meta: [{ title: "SLA 관리 — Hanpass OB CRM" }] }),
  component: SlaPage,
});

const won = (n: number) => `₩${Number(n || 0).toLocaleString()}`;

function SlaPage() {
  const { isAdmin } = useAuth();
  useSlaRealtime();

  const today = todayKstIso();
  const weekStart = weekStartKstIso();
  const monthStart = monthStartKstIso();

  const todayQ = useSlaTeamSummary(today, today);
  const weekQ = useSlaTeamSummary(weekStart, today);
  const monthQ = useSlaTeamSummary(monthStart, today);

  const violationsQ = useSlaViolations();
  const adjustmentsQ = useSlaAdjustments(30);
  const upcomingQ = useSlaUpcoming(24);

  const totalToday = useMemo(() => sumFine(todayQ.data), [todayQ.data]);
  const totalWeek = useMemo(() => sumFine(weekQ.data), [weekQ.data]);
  const totalMonth = useMemo(() => sumFine(monthQ.data), [monthQ.data]);
  const activeCount = violationsQ.data?.length ?? 0;

  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const filteredViolations = useMemo(() => {
    const rows = violationsQ.data ?? [];
    return selectedCountry ? rows.filter((r) => r.country_id === selectedCountry) : rows;
  }, [violationsQ.data, selectedCountry]);

  const [action, setAction] = useState<null | {
    type: "reset" | "override" | "waive";
    team: SlaTeamRow;
  }>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SLA 관리"
        description="개통 신청자 팀별 SLA 준수 현황과 벌금을 실시간으로 관리합니다."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="현재 SLA 위반"
          value={activeCount.toLocaleString()}
          icon={AlertTriangle}
          tone="destructive"
          hint="개통 신청자 중 SLA 초과"
        />
        <StatCard label="오늘 벌금" value={won(totalToday)} icon={AlertTriangle} tone="warning" />
        <StatCard label="이번 주 벌금" value={won(totalWeek)} icon={AlertTriangle} tone="warning" />
        <StatCard label="이번 달 벌금" value={won(totalMonth)} icon={AlertTriangle} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>팀별 SLA 현황</CardTitle>
          <CardDescription>
            SLA 기준 · 미처리 24h(하루 ₩5,000), 진행중 48h(하루 ₩3,000), 부재 48h(하루 ₩5,000)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="month">
            <TabsList>
              <TabsTrigger value="today">오늘</TabsTrigger>
              <TabsTrigger value="week">이번 주</TabsTrigger>
              <TabsTrigger value="month">이번 달</TabsTrigger>
            </TabsList>
            <TabsContent value="today">
              <TeamTable
                data={todayQ.data ?? []}
                loading={todayQ.isLoading}
                isAdmin={isAdmin}
                selectedCountry={selectedCountry}
                onSelect={setSelectedCountry}
                onAction={(type, team) => setAction({ type, team })}
              />
            </TabsContent>
            <TabsContent value="week">
              <TeamTable
                data={weekQ.data ?? []}
                loading={weekQ.isLoading}
                isAdmin={isAdmin}
                selectedCountry={selectedCountry}
                onSelect={setSelectedCountry}
                onAction={(type, team) => setAction({ type, team })}
              />
            </TabsContent>
            <TabsContent value="month">
              <TeamTable
                data={monthQ.data ?? []}
                loading={monthQ.isLoading}
                isAdmin={isAdmin}
                selectedCountry={selectedCountry}
                onSelect={setSelectedCountry}
                onAction={(type, team) => setAction({ type, team })}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            SLA 위반 고객
            {selectedCountry && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={() => setSelectedCountry(null)}
              >
                필터 해제
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            현재 SLA를 초과한 개통 신청자 목록입니다. 상태를 변경하면 실시간으로 갱신됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {violationsQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filteredViolations.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              현재 SLA 위반 고객이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>팀</TableHead>
                  <TableHead>고객</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>기준시각</TableHead>
                  <TableHead>초과일수</TableHead>
                  <TableHead className="text-right">누적 벌금</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredViolations.slice(0, 200).map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell>
                      <Badge variant="outline">{r.country_code ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge>{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.since).toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-destructive">{r.overdue_days}일</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({Math.round(r.overdue_hours)}h)
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{won(r.fine_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Clock className="h-4 w-4" />
            벌금 부과 예정 (24시간 이내)
          </CardTitle>
          <CardDescription>
            아래 고객들은 아직 SLA 마감 전이지만, 남은 시간 이후 벌금이 부과됩니다. 지금 조치하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {upcomingQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (upcomingQ.data?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              24시간 이내 벌금 부과 예정 고객이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>팀</TableHead>
                  <TableHead>고객</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>마감시각</TableHead>
                  <TableHead>남은 시간</TableHead>
                  <TableHead className="text-right">부과 예정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(upcomingQ.data ?? []).slice(0, 200).map((r) => {
                  const h = Math.max(0, Number(r.hours_remaining) || 0);
                  const urgent = h <= 6;
                  return (
                    <TableRow key={r.customer_id}>
                      <TableCell>
                        <Badge variant="outline">{r.country_code ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.customer_name}</div>
                        <div className="text-xs text-muted-foreground">{r.phone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.deadline).toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            urgent
                              ? "font-semibold text-destructive"
                              : "font-semibold text-amber-600 dark:text-amber-400"
                          }
                        >
                          {h < 1
                            ? `${Math.round(h * 60)}분 후`
                            : `${Math.floor(h)}시간 ${Math.round((h % 1) * 60)}분 후`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {won(r.fine_amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            변경 이력
          </CardTitle>
          <CardDescription>관리자의 벌금 조정 기록입니다.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {adjustmentsQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (adjustmentsQ.data?.length ?? 0) === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">기록 없음</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시각</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>사유</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustmentsQ.data!.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("ko-KR")}</TableCell>
                    <TableCell>
                      <Badge variant={a.adjustment_type === "reset" ? "destructive" : "secondary"}>
                        {a.adjustment_type === "reset" ? "초기화" : a.adjustment_type === "override" ? "수정" : "면제"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.period_start} ~ {a.period_end}
                    </TableCell>
                    <TableCell className="text-right">{won(a.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {action && (
        <AdminActionDialog
          action={action}
          periodStart={monthStart}
          periodEnd={today}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function sumFine(rows: SlaTeamRow[] | undefined) {
  return (rows ?? []).reduce((s, r) => s + Number(r.net_fine || 0), 0);
}

function TeamTable(props: {
  data: SlaTeamRow[];
  loading: boolean;
  isAdmin: boolean;
  selectedCountry: string | null;
  onSelect: (id: string | null) => void;
  onAction: (type: "reset" | "override" | "waive", team: SlaTeamRow) => void;
}) {
  if (props.loading) return <Skeleton className="mt-4 h-40 w-full" />;
  if (!props.data.length) {
    return <div className="py-8 text-center text-sm text-muted-foreground">SLA 위반 팀이 없습니다.</div>;
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>팀</TableHead>
            <TableHead className="text-right">미처리 초과</TableHead>
            <TableHead className="text-right">진행중 초과</TableHead>
            <TableHead className="text-right">부재 초과</TableHead>
            <TableHead className="text-right">총 위반</TableHead>
            <TableHead className="text-right">벌금 (기간)</TableHead>
            {props.isAdmin && <TableHead className="text-right">관리</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.data.map((r) => {
            const selected = props.selectedCountry === r.country_id;
            return (
              <TableRow
                key={r.country_id}
                className={selected ? "bg-muted/50" : "cursor-pointer"}
                onClick={() => props.onSelect(selected ? null : r.country_id)}
              >
                <TableCell>
                  <div className="font-semibold">{r.country_code}</div>
                  <div className="text-xs text-muted-foreground">{r.country_name}</div>
                </TableCell>
                <TableCell className="text-right">{r.violations_new}</TableCell>
                <TableCell className="text-right">{r.violations_in_progress}</TableCell>
                <TableCell className="text-right">{r.violations_absent}</TableCell>
                <TableCell className="text-right font-semibold">{r.violations_total}</TableCell>
                <TableCell className="text-right font-semibold text-destructive">
                  {won(r.net_fine)}
                  {r.adjustments !== 0 && (
                    <div className="text-xs font-normal text-muted-foreground">
                      조정 {won(r.adjustments)}
                    </div>
                  )}
                </TableCell>
                {props.isAdmin && (
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="초기화" onClick={() => props.onAction("reset", r)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="수정" onClick={() => props.onAction("override", r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="면제" onClick={() => props.onAction("waive", r)}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function AdminActionDialog(props: {
  action: { type: "reset" | "override" | "waive"; team: SlaTeamRow };
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
}) {
  const { action } = props;
  const { reset, override, waive } = useSlaAdminActions();
  const [amount, setAmount] = useState<string>(String(action.team.net_fine));
  const [reason, setReason] = useState("");
  const [periodStart, setPeriodStart] = useState(props.periodStart);
  const [periodEnd, setPeriodEnd] = useState(props.periodEnd);

  const title =
    action.type === "reset" ? "벌금 초기화"
    : action.type === "override" ? "벌금 금액 수정"
    : "벌금 면제";

  const busy = reset.isPending || override.isPending || waive.isPending;

  const submit = async () => {
    try {
      const base = { countryId: action.team.country_id, periodStart, periodEnd, reason: reason || undefined };
      if (action.type === "reset") {
        await reset.mutateAsync(base);
        toast.success("벌금이 초기화되었습니다.");
      } else if (action.type === "override") {
        await override.mutateAsync({ ...base, amount: Math.max(0, Number(amount) || 0) });
        toast.success("벌금이 수정되었습니다.");
      } else {
        await waive.mutateAsync({ ...base, amount: Math.max(0, Number(amount) || 0) });
        toast.success("벌금이 면제되었습니다.");
      }
      props.onClose();
    } catch (e) {
      toast.error((e as Error).message || "처리 실패");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title} — {action.team.country_code} ({action.team.country_name})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>기간 시작</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>기간 종료</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          {action.type !== "reset" && (
            <div>
              <Label>금액 (₩)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                {action.type === "override" ? "이 기간의 팀 벌금을 이 금액으로 확정합니다." : "이 금액만큼 벌금을 감액합니다."}
              </p>
            </div>
          )}
          <div>
            <Label>사유 (선택)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} disabled={busy}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
