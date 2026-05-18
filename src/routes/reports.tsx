import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, PhoneCall } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dateKey, dayEndIso, dayStartIso } from "@/lib/date-range";
import { STATUS_LABEL, type CustomerStatus } from "@/lib/labels";
import i18n from "@/i18n";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "리포트 — Hanpass OB CRM" }] }),
  component: Reports,
});

function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => {
      const v = cell == null ? "" : String(cell);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}

async function exportCalls() {
  const t = i18n.t.bind(i18n);
  const { data, error } = await supabase
    .from("customer_call_rounds")
    .select("call_date, round, customer_id, staff_id, created_at")
    .order("call_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return toast.error(error.message);

  const logs = (data ?? []) as { call_date: string; round: number; customer_id: string; staff_id: string; created_at: string }[];
  const customerIds = [...new Set(logs.map((r) => r.customer_id))];
  const staffIds = [...new Set(logs.map((r) => r.staff_id))];
  const [{ data: customers }, { data: staff }] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name, phone").in("id", customerIds) : Promise.resolve({ data: [] }),
    staffIds.length ? supabase.from("profiles").select("id, display_name").in("id", staffIds) : Promise.resolve({ data: [] }),
  ]);
  const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));
  const staffMap = new Map((staff ?? []).map((p: any) => [p.id, p.display_name]));

  const rows: (string | number)[][] = [["콜일", "기록시간", "고객명", "전화번호", "직원", "콜라운드"]];
  for (const r of logs) {
    const customer = customerMap.get(r.customer_id);
    rows.push([
      r.call_date,
      new Date(r.created_at).toLocaleString("ko-KR"),
      customer?.name ?? "",
      customer?.phone ?? "",
      staffMap.get(r.staff_id) ?? "",
      `${r.round}차`,
    ]);
  }
  downloadCSV(`콜로그_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  toast.success(t("reports.exportDone", { n: rows.length - 1 }));
}

async function exportCustomers() {
  const t = i18n.t.bind(i18n);
  const { data, error } = await supabase
    .from("customers")
    .select("name, phone, email, status, signup_date, country:countries(code, name_ko), channel:channels(name), staff:profiles!customers_assigned_to_fkey(display_name)");
  if (error) return toast.error(error.message);
  const rows: (string | number)[][] = [["이름", "전화", "이메일", "국가", "채널", "담당자", "상태", "등록일"]];
  for (const r of (data ?? []) as any[]) {
    rows.push([
      r.name, r.phone, r.email ?? "",
      r.country ? `${r.country.code} ${r.country.name_ko}` : "",
      r.channel?.name ?? "",
      r.staff?.display_name ?? "",
      STATUS_LABEL[r.status as CustomerStatus],
      r.signup_date,
    ]);
  }
  downloadCSV(`고객명단_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  toast.success(t("reports.exportDone", { n: rows.length - 1 }));
}

async function exportStaffMonthly() {
  const t = i18n.t.bind(i18n);
  const now = new Date();
  const Y = now.getFullYear(); const M = now.getMonth() + 1;
  const monthStart = dayStartIso(new Date(Y, M - 1, 1));
  const monthEnd = dayEndIso(new Date(Y, M, 0));
  const { data, error } = await (supabase as any).rpc("stats_staff_ranking", {
    _date_from: monthStart,
    _date_to: monthEnd,
    _year: Y,
    _month: M,
    _country_id: null,
    _attendance_date: dateKey(new Date()),
  });
  if (error) return toast.error(error.message);
  const rows: (string | number)[][] = [["직원", "콜수", "개통", "개통목표", "달성률(%)", "출근상태"]];
  for (const u of data ?? []) {
    const calls = Number(u.total_calls ?? 0);
    const activated = Number(u.activated ?? 0);
    const target = Number(u.activation_target ?? 0);
    rows.push([u.display_name, calls, activated, target, target ? Math.round((activated / target) * 100) : 0, u.attendance ?? "present"]);
  }
  downloadCSV(`직원성과_${Y}-${String(M).padStart(2,"0")}.csv`, rows);
  toast.success(t("reports.exportDone", { n: rows.length - 1 }));
}

function Reports() {
  const { t } = useTranslation();
  const reports = [
    { key: "calls", title: t("reports.callLogs"), desc: t("reports.callLogsDesc"), icon: PhoneCall, fn: exportCalls },
    { key: "customers", title: t("reports.customerList"), desc: t("reports.customerListDesc"), icon: Users, fn: exportCustomers },
    { key: "staff", title: t("reports.staffMonthly"), desc: t("reports.staffMonthlyDesc"), icon: Users, fn: exportStaffMonthly },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title={t("reports.title")} description={t("reports.subtitle")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.key} className="transition hover:shadow-card-hover">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <r.icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">{r.title}</CardTitle>
                <CardDescription className="text-xs">{r.desc}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button size="sm" className="w-full" onClick={() => r.fn().catch((e) => toast.error(String(e)))}>
                <Download className="mr-2 h-4 w-4" /> {t("reports.download")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {t("reports.hint")}
        </CardContent>
      </Card>
    </div>
  );
}
