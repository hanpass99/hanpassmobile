import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
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
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ATTENDANCE_STATUSES, ATTENDANCE_CLASS, type AttendanceStatus } from "@/lib/labels";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "출근 관리 — Hanpass OB CRM" }] }),
  component: AttendancePage,
});

type StaffRow = { id: string; name: string; totalCalls: number; activated: number; attendance: AttendanceStatus };
type HistoryRow = { id: string; user_id: string; attendance_date: string; status: AttendanceStatus; note: string | null; set_by: string | null; updated_at: string };

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AttendancePage() {
  const { t } = useTranslation();
  const { isAdmin, user } = useAuth();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [date, setDate] = useState<Date>(today);
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>("present");
  const [loading, setLoading] = useState(true);

  const dateKey = isoDate(date);

  const load = useCallback(async () => {
    setLoading(true);
    const fromIso = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).toISOString();
    const toIso = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59).toISOString();
    const [{ data: ranking, error: rankingError }, { data: attendance }, { data: history }] = await Promise.all([
      (supabase as any).rpc("stats_staff_ranking", {
        _date_from: fromIso,
        _date_to: toIso,
        _year: date.getFullYear(),
        _month: date.getMonth() + 1,
        _country_id: null,
        _attendance_date: null,
      }),
      supabase.from("staff_attendance").select("user_id, status").eq("attendance_date", dateKey),
      supabase.from("staff_attendance").select("id, user_id, attendance_date, status, note, set_by, updated_at").order("attendance_date", { ascending: false }).order("updated_at", { ascending: false }).limit(300),
    ]);

    if (rankingError) {
      toast.error(rankingError.message);
      setLoading(false);
      return;
    }

    const attendanceMap = new Map<string, AttendanceStatus>();
    (attendance ?? []).forEach((a: any) => attendanceMap.set(a.user_id, a.status));
    setRows((ranking ?? []).map((r: any) => ({
      id: r.user_id,
      name: r.display_name,
      totalCalls: Number(r.total_calls ?? 0),
      activated: Number(r.activated ?? 0),
      attendance: (attendanceMap.get(r.user_id) ?? "present") as AttendanceStatus,
    })));
    setHistoryRows((history ?? []) as HistoryRow[]);
    setLoading(false);
  }, [date, dateKey]);

  useEffect(() => { void load(); }, [load]);

  const staffName = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);
  const visibleHistory = selectedStaff === "all" ? historyRows : historyRows.filter((h) => h.user_id === selectedStaff);
  const presentRows = rows.filter((r) => r.attendance === "present");
  const avgCalls = presentRows.length ? Math.round(presentRows.reduce((sum, r) => sum + r.totalCalls, 0) / presentRows.length) : 0;

  const changeAttendance = async (userId: string, status: AttendanceStatus) => {
    if (!isAdmin && user?.id !== userId) {
      toast.error(t("attendance.forbidden"));
      return;
    }
    const { error } = await (supabase as any).rpc("set_staff_attendance", {
      _user_id: userId,
      _date: dateKey,
      _status: status,
      _note: null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("attendance.updated"));
    void load();
  };

  const applyBulk = async () => {
    if (!isAdmin) return toast.error(t("attendance.forbidden"));
    const targets = rows.map((r) => r.id);
    const results = await Promise.all(targets.map((id) => (supabase as any).rpc("set_staff_attendance", {
      _user_id: id,
      _date: dateKey,
      _status: bulkStatus,
      _note: null,
    })));
    const failed = results.find((r) => r.error);
    if (failed?.error) return toast.error(failed.error.message);
    toast.success(t("attendance.savedCount", { count: targets.length }));
    void load();
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
              <Button size="sm" onClick={applyBulk}>{t("attendance.bulkApply")}</Button>
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
              {rows.map((r) => (
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
              {!rows.length && !loading && (
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
              {visibleHistory.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap">{h.attendance_date}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{staffName.get(h.user_id) ?? "—"}</TableCell>
                  <TableCell><Badge className={cn("border-transparent", ATTENDANCE_CLASS[h.status])}>{t(`attendance.status.${h.status}`)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{h.set_by ? (staffName.get(h.set_by) ?? "—") : "—"}</TableCell>
                </TableRow>
              ))}
              {!visibleHistory.length && (
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