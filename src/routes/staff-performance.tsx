import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_STATUSES, type CustomerStatus,
  ATTENDANCE_CLASS, type AttendanceStatus,
} from "@/lib/labels";
import { useStaffPerformance } from "@/hooks/use-staff";


export const Route = createFileRoute("/staff-performance")({
  head: () => ({ meta: [{ title: "직원 성과 — Hanpass OB CRM" }] }),
  component: StaffPerf,
});

type Counts = Record<CustomerStatus, number>;
type TierKey = "diamond" | "platinum" | "gold" | "silver" | "bronze" | "rookie";
type Tier = { key: TierKey; cls: string };
type Row = {
  id: string;
  name: string;
  total: number;
  counts: Counts;
  tier: Tier;
  attendance: AttendanceStatus;
};

function tierFor(activated: number): Tier {
  if (activated >= 50) return { key: "diamond", cls: "bg-info/15 text-info" };
  if (activated >= 30) return { key: "platinum", cls: "bg-primary-soft text-primary" };
  if (activated >= 15) return { key: "gold", cls: "bg-warning/20 text-warning-foreground" };
  if (activated >= 5)  return { key: "silver", cls: "bg-muted text-foreground" };
  if (activated >= 1)  return { key: "bronze", cls: "bg-destructive/10 text-destructive" };
  return { key: "rookie", cls: "bg-muted text-muted-foreground" };
}

const emptyCounts = (): Counts => Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Counts;

function StaffPerf() {
  const { t } = useTranslation();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState<Date>(start);
  const [to, setTo] = useState<Date>(today);
  const [attendanceDate, setAttendanceDate] = useState<Date>(today);
  const [presentOnly, setPresentOnly] = useState<boolean>(true);

  const { data, isLoading: loading } = useStaffPerformance({ from, to, attendanceDate });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const orderMap = new Map<string, number>();
    data.profiles.forEach((p) => orderMap.set(p.id, p.sort_order ?? 1000));
    const attMap = new Map<string, AttendanceStatus>();
    data.attendance.forEach((a) => attMap.set(a.user_id, a.status as AttendanceStatus));
    const statsMap = new Map<string, (typeof data.staffStats)[number]>();
    data.staffStats.forEach((r) => statsMap.set(r.user_id, r));
    return data.ranking.map((r) => {
      const stat = statsMap.get(r.user_id);
      const counts = emptyCounts();
      const sc = (stat?.status_counts ?? {}) as Record<string, number>;
      for (const s of CUSTOMER_STATUSES) counts[s] = Number(sc[s] ?? 0);
      counts.activated = Number(r.activated ?? counts.activated);
      return {
        id: r.user_id,
        name: r.display_name,
        total: Number(r.total_calls ?? 0),
        counts,
        tier: tierFor(Number(r.activated ?? 0)),
        attendance: (attMap.get(r.user_id) ?? "present") as AttendanceStatus,
      };
    }).sort((a, b) => (orderMap.get(a.id) ?? 1000) - (orderMap.get(b.id) ?? 1000) || a.name.localeCompare(b.name));
  }, [data]);


  const visibleRows = presentOnly ? rows.filter((r) => r.attendance === "present") : rows;
  const presentCount = rows.filter((r) => r.attendance === "present").length;
  const avgCalls = presentCount > 0
    ? Math.round(rows.filter((r) => r.attendance === "present").reduce((s, r) => s + r.total, 0) / presentCount)
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader title={t("staffPerf.title")} description={loading ? t("common.loading") : t("staffPerf.subtitle")} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("common.startDate")}</div>
            <DatePick value={from} onChange={setFrom} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("common.endDate")}</div>
            <DatePick value={to} onChange={setTo} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("attendance.today")}</div>
            <DatePick value={attendanceDate} onChange={setAttendanceDate} />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFrom(start); setTo(today); setAttendanceDate(today); }}>
            {t("common.thisMonth")}
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Switch id="presentOnly" checked={presentOnly} onCheckedChange={setPresentOnly} />
            <Label htmlFor="presentOnly" className="cursor-pointer">{t("attendance.filterPresentOnly")}</Label>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{t("attendance.presentToday")}</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{presentCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{t("attendance.avgCalls")}</div>
          <div className="mt-1 text-2xl font-bold">{avgCalls}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{t("attendance.title")}</CardTitle>
            <Badge variant="outline" className="font-normal">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {t("dashboard.totalCalls")}: {format(from, "yyyy.MM.dd")} ~ {format(to, "yyyy.MM.dd")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-12">{t("staffPerf.rank")}</TableHead>
                <TableHead>{t("staffPerf.staff")}</TableHead>
                <TableHead>{t("attendance.title")}</TableHead>
                <TableHead>{t("staffPerf.tier")}</TableHead>
                <TableHead className="text-right">{t("dashboard.totalCalls")}</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{t(`status.${s}`)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((u, i) => (
                <TableRow key={u.id}>
                  <TableCell>
                    {i < 3 ? (
                      <div className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                        i === 0 && "bg-warning/20 text-warning-foreground",
                        i === 1 && "bg-muted text-foreground",
                        i === 2 && "bg-destructive/15 text-destructive",
                      )}>
                        <Trophy className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">{i + 1}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold whitespace-nowrap">{u.name}</TableCell>
                  <TableCell>
                    <Badge className={cn("border-transparent", ATTENDANCE_CLASS[u.attendance])}>
                      {t(`attendance.status.${u.attendance}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("border-transparent", u.tier.cls)}>{t(`staffPerf.${u.tier.key}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">{u.total}</TableCell>
                  {CUSTOMER_STATUSES.map((s) => (
                    <TableCell key={s} className={cn(
                      "text-right",
                      s === "activated" && "font-bold text-primary",
                    )}>{u.counts[s]}</TableCell>
                  ))}
                </TableRow>
              ))}
              {!visibleRows.length && !loading && (
                <TableRow><TableCell colSpan={5 + CUSTOMER_STATUSES.length} className="text-center py-8 text-sm text-muted-foreground">{t("dashboard.noStaff")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-2">{t("staffPerf.tierTitle")}</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="bg-info/15 text-info border-transparent">{t("staffPerf.diamond")} 50+</Badge>
            <Badge className="bg-primary-soft text-primary border-transparent">{t("staffPerf.platinum")} 30+</Badge>
            <Badge className="bg-warning/20 text-warning-foreground border-transparent">{t("staffPerf.gold")} 15+</Badge>
            <Badge className="bg-muted text-foreground border-transparent">{t("staffPerf.silver")} 5+</Badge>
            <Badge className="bg-destructive/10 text-destructive border-transparent">{t("staffPerf.bronze")} 1+</Badge>
            <Badge className="bg-muted text-muted-foreground border-transparent">{t("staffPerf.rookie")} 0</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DatePick({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(value, "yyyy.MM.dd")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
