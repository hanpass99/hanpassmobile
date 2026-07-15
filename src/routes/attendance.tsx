import i18n from "@/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle2, History, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { dateKey as formatDateKey } from "@/lib/date-range";
import { ATTENDANCE_STATUSES, ATTENDANCE_CLASS, type AttendanceStatus } from "@/lib/labels";
import { useAttendance } from "@/hooks/use-attendance";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: i18n.t("head.attendance") }] }),
  component: AttendancePage,
});

type StaffRow = { id: string; name: string; totalCalls: number; activated: number; attendance: AttendanceStatus };

function AttendancePage() {
  const { t } = useTranslation();
  const { isAdmin, user } = useAuth();
  const today = new Date();
  const [date, setDate] = useState<Date>(today);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>("present");

  const dateKey = formatDateKey(date);
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useAttendance(date);

  const rows = useMemo<StaffRow[]>(() => {
    if (!data) return [];
    const attendanceMap = new Map<string, AttendanceStatus>();
    data.attendance.forEach((a) => attendanceMap.set(a.user_id, a.status as AttendanceStatus));
    return data.ranking.map((r) => ({
      id: r.user_id,
      name: r.display_name,
      totalCalls: Number(r.total_calls ?? 0),
      activated: Number(r.activated ?? 0),
      attendance: (attendanceMap.get(r.user_id) ?? "present") as AttendanceStatus,
    }));
  }, [data]);
  const historyRows = data?.history ?? [];

  const staffName = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);
  const visibleHistory = selectedStaff === "all" ? historyRows : historyRows.filter((h) => h.user_id === selectedStaff);
  const presentRows = rows.filter((r) => r.attendance === "present");
  const avgCalls = presentRows.length ? Math.round(presentRows.reduce((sum, r) => sum + r.totalCalls, 0) / presentRows.length) : 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["attendance", dateKey] });

  const changeAttendance = async (userId: string, status: AttendanceStatus) => {
    if (!isAdmin && user?.id !== userId) {
      toast.error(t("attendance.forbidden"));
      return;
    }
    const { error } = await supabase.rpc("set_staff_attendance", {
      _user_id: userId,
      _date: dateKey,
      _status: status,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("attendance.updated"));
    invalidate();
  };

  const applyBulk = async () => {
    if (!isAdmin) return toast.error(t("attendance.forbidden"));
    const targets = rows.map((r) => r.id);
    const results = await Promise.all(targets.map((id) => supabase.rpc("set_staff_attendance", {
      _user_id: id,
      _date: dateKey,
      _status: bulkStatus,
    })));
    const failed = results.find((r) => r.error);
    if (failed?.error) return toast.error(failed.error.message);
    toast.success(t("attendance.savedCount", { count: targets.length }));
    invalidate();
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("attendance.title")} description={loading ? t("common.loading") : t("attendance.subtitle")} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("attendance.selectedDate")}</div>
            <DatePick value={date} onChange={setDate} />
          </div>
          {isAdmin && (
            <div className="ml-auto flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{t("attendance.bulkStatus")}</div>
                <AttendanceSelect value={bulkStatus} onChange={setBulkStatus} />
              </div>
              <Button size="sm" onClick={applyBulk} aria-busy={loading}>{t("attendance.bulkApply")}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard icon={Users} label={t("attendance.allStaff")} value={rows.length} />
        <SummaryCard icon={CheckCircle2} label={t("attendance.presentToday")} value={presentRows.length} />
        <SummaryCard icon={History} label={t("attendance.avgCalls")} value={avgCalls} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{format(date, "yyyy.MM.dd")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t("staffPerf.staff")}</TableHead>
                <TableHead>{t("attendance.title")}</TableHead>
                <TableHead className="text-right">{t("dashboard.calls")}</TableHead>
                <TableHead className="text-right">{t("dashboard.activations")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-7 w-28" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                  </TableRow>
                ))
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold whitespace-nowrap">{r.name}</TableCell>
                  <TableCell>
                    {(isAdmin || user?.id === r.id) ? (
                      <AttendanceSelect value={r.attendance} onChange={(v) => changeAttendance(r.id, v)} />
                    ) : (
                      <Badge className={cn("border-transparent", ATTENDANCE_CLASS[r.attendance])}>{t(`attendance.status.${r.attendance}`)}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold">{r.totalCalls.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{r.activated.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!loading && !rows.length && (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="text-base">{t("attendance.history")}</CardTitle>
          <Select value={selectedStaff} onValueChange={setSelectedStaff}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("attendance.allStaff")}</SelectItem>
              {rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t("common.registeredDate")}</TableHead>
                <TableHead>{t("staffPerf.staff")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("attendance.setBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sh-${i}`}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))
              ) : visibleHistory.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap">{h.attendance_date}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{staffName.get(h.user_id) ?? "—"}</TableCell>
                  <TableCell><Badge className={cn("border-transparent", ATTENDANCE_CLASS[h.status])}>{t(`attendance.status.${h.status}`)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{h.set_by ? (staffName.get(h.set_by) ?? "—") : "—"}</TableCell>
                </TableRow>
              ))}
              {!loading && !visibleHistory.length && (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">{t("attendance.noHistory")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceSelect({ value, onChange }: { value: AttendanceStatus; onChange: (v: AttendanceStatus) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AttendanceStatus)}>
      <SelectTrigger className={cn("h-8 w-[112px] border-transparent text-xs", ATTENDANCE_CLASS[value])}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ATTENDANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`attendance.status.${s}`)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon className="h-4 w-4" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{value.toLocaleString()}</div></div>
    </CardContent></Card>
  );
}

function DatePick({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(value, "yyyy.MM.dd")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );
}
