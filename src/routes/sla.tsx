import i18n from "@/i18n";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  useStaffCallFines, useToggleCallWaiver,
  monthStartKstIso, todayKstIso, weekStartKstIso,
  type SlaTeamRow,
} from "@/hooks/use-sla";
import { STATUS_LABEL } from "@/lib/labels";

export const Route = createFileRoute("/sla")({
  head: () => ({ meta: [{ title: i18n.t("head.sla") }] }),
  component: SlaPage,
});

const won = (n: number) => `₩${Number(n || 0).toLocaleString()}`;

function SlaPage() {
  const { t, i18n: i18nInst } = useTranslation();
  const locale = i18nInst.language === "en" ? "en-US" : "ko-KR";
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
        title={t("sla.title")}
        description={t("sla.subtitle")}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("sla.currentViolations")}
          value={activeCount.toLocaleString()}
          icon={AlertTriangle}
          tone="destructive"
          hint={t("sla.currentViolationsHint")}
        />
        <StatCard label={t("sla.todayFine")} value={won(totalToday)} icon={AlertTriangle} tone="warning" />
        <StatCard label={t("sla.weekFine")} value={won(totalWeek)} icon={AlertTriangle} tone="warning" />
        <StatCard label={t("sla.monthFine")} value={won(totalMonth)} icon={AlertTriangle} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sla.teamStatus")}</CardTitle>
          <CardDescription>{t("sla.teamStatusDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="month">
            <TabsList>
              <TabsTrigger value="today">{t("sla.tabToday")}</TabsTrigger>
              <TabsTrigger value="week">{t("sla.tabWeek")}</TabsTrigger>
              <TabsTrigger value="month">{t("sla.tabMonth")}</TabsTrigger>
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
            {t("sla.violationCustomers")}
            {selectedCountry && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={() => setSelectedCountry(null)}
              >
                {t("sla.clearFilter")}
              </Button>
            )}
          </CardTitle>
          <CardDescription>{t("sla.violationDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {violationsQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filteredViolations.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("sla.noViolations")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sla.team")}</TableHead>
                  <TableHead>{t("sla.customer")}</TableHead>
                  <TableHead>{t("sla.status")}</TableHead>
                  <TableHead>{t("sla.since")}</TableHead>
                  <TableHead>{t("sla.overdueDays")}</TableHead>
                  <TableHead className="text-right">{t("sla.fineTotal")}</TableHead>
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
                      {new Date(r.since).toLocaleString(locale)}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-destructive">{t("sla.days", { n: r.overdue_days })}</span>
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
            {t("sla.upcoming")}
          </CardTitle>
          <CardDescription>{t("sla.upcomingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {upcomingQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (upcomingQ.data?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("sla.noUpcoming")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sla.team")}</TableHead>
                  <TableHead>{t("sla.customer")}</TableHead>
                  <TableHead>{t("sla.status")}</TableHead>
                  <TableHead>{t("sla.deadline")}</TableHead>
                  <TableHead>{t("sla.timeLeft")}</TableHead>
                  <TableHead className="text-right">{t("sla.upcomingFine")}</TableHead>
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
                        {new Date(r.deadline).toLocaleString(locale)}
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
                            ? t("sla.minutesLater", { n: Math.round(h * 60) })
                            : t("sla.hoursMinutesLater", { h: Math.floor(h), m: Math.round((h % 1) * 60) })}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t("sla.history")}
          </CardTitle>
          <CardDescription>{t("sla.historyDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {adjustmentsQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (adjustmentsQ.data?.length ?? 0) === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("sla.noHistory")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sla.time")}</TableHead>
                  <TableHead>{t("sla.type")}</TableHead>
                  <TableHead>{t("sla.period")}</TableHead>
                  <TableHead className="text-right">{t("sla.amount")}</TableHead>
                  <TableHead>{t("sla.reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustmentsQ.data!.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.created_at).toLocaleString(locale)}</TableCell>
                    <TableCell>
                      <Badge variant={a.adjustment_type === "reset" ? "destructive" : "secondary"}>
                        {a.adjustment_type === "reset"
                          ? t("sla.typeReset")
                          : a.adjustment_type === "override"
                            ? t("sla.typeOverride")
                            : t("sla.typeWaive")}
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

      <StaffCallFinesCard periodStart={monthStart} periodEnd={today} isAdmin={isAdmin} today={today} />

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
  const { t } = useTranslation();
  if (props.loading) return <Skeleton className="mt-4 h-40 w-full" />;
  if (!props.data.length) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{t("sla.noTeamViolations")}</div>;
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("sla.team")}</TableHead>
            <TableHead className="text-right">{t("sla.colUnprocessed")}</TableHead>
            <TableHead className="text-right">{t("sla.colInProgress")}</TableHead>
            <TableHead className="text-right">{t("sla.colAbsent")}</TableHead>
            <TableHead className="text-right">{t("sla.colTotal")}</TableHead>
            <TableHead className="text-right">{t("sla.colFine")}</TableHead>
            {props.isAdmin && <TableHead className="text-right">{t("sla.colManage")}</TableHead>}
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
                      {t("sla.adjustLabel", { amt: won(r.adjustments) })}
                    </div>
                  )}
                </TableCell>
                {props.isAdmin && (
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title={t("sla.typeReset")} onClick={() => props.onAction("reset", r)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title={t("sla.typeOverride")} onClick={() => props.onAction("override", r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title={t("sla.typeWaive")} onClick={() => props.onAction("waive", r)}>
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
  const { t } = useTranslation();
  const { action } = props;
  const { reset, override, waive } = useSlaAdminActions();
  const [amount, setAmount] = useState<string>(String(action.team.net_fine));
  const [reason, setReason] = useState("");
  const [periodStart, setPeriodStart] = useState(props.periodStart);
  const [periodEnd, setPeriodEnd] = useState(props.periodEnd);

  const title =
    action.type === "reset" ? t("sla.dlgReset")
    : action.type === "override" ? t("sla.dlgOverride")
    : t("sla.dlgWaive");

  const busy = reset.isPending || override.isPending || waive.isPending;

  const submit = async () => {
    try {
      const base = { countryId: action.team.country_id, periodStart, periodEnd, reason: reason || undefined };
      if (action.type === "reset") {
        await reset.mutateAsync(base);
        toast.success(t("sla.toastReset"));
      } else if (action.type === "override") {
        await override.mutateAsync({ ...base, amount: Math.max(0, Number(amount) || 0) });
        toast.success(t("sla.toastOverride"));
      } else {
        await waive.mutateAsync({ ...base, amount: Math.max(0, Number(amount) || 0) });
        toast.success(t("sla.toastWaive"));
      }
      props.onClose();
    } catch (e) {
      toast.error((e as Error).message || t("sla.toastFail"));
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
              <Label>{t("sla.periodStart")}</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>{t("sla.periodEnd")}</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          {action.type !== "reset" && (
            <div>
              <Label>{t("sla.amountWon")}</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                {action.type === "override" ? t("sla.amountHelpOverride") : t("sla.amountHelpWaive")}
              </p>
            </div>
          )}
          <div>
            <Label>{t("sla.reasonOptional")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={busy}>{t("sla.cancel")}</Button>
          <Button onClick={submit} disabled={busy}>{t("sla.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
