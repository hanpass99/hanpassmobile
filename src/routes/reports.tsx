import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, Globe2, Radio, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CALL_RESULT_LABEL, STATUS_LABEL, type CallResult, type CustomerStatus } from "@/lib/labels";

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
  const { data, error } = await supabase
    .from("call_logs")
    .select("call_date, result, duration_sec, is_activation, notes, customer:customers(name, phone), staff:profiles!call_logs_staff_id_fkey(display_name)")
    .order("call_date", { ascending: false });
  if (error) return toast.error(error.message);
  const rows: (string | number)[][] = [["일시", "고객명", "전화번호", "담당자", "결과", "통화(초)", "개통", "메모"]];
  for (const r of (data ?? []) as any[]) {
    rows.push([
      new Date(r.call_date).toLocaleString("ko-KR"),
      r.customer?.name ?? "",
      r.customer?.phone ?? "",
      r.staff?.display_name ?? "",
      CALL_RESULT_LABEL[r.result as CallResult],
      r.duration_sec,
      r.is_activation ? "Y" : "N",
      r.notes ?? "",
    ]);
  }
  downloadCSV(`콜로그_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  toast.success(`${rows.length - 1}건 내보내기 완료`);
}

async function exportCustomers() {
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
  toast.success(`${rows.length - 1}건 내보내기 완료`);
}

async function exportStaffMonthly() {
  const now = new Date();
  const Y = now.getFullYear(); const M = now.getMonth() + 1;
  const monthStart = new Date(Y, M - 1, 1).toISOString();
  const [sf, lg, tg] = await Promise.all([
    supabase.from("profiles").select("id, display_name").eq("is_active", true),
    supabase.from("call_logs").select("staff_id, result, is_activation").gte("call_date", monthStart),
    supabase.from("targets").select("user_id, activation_target, call_target").eq("year", Y).eq("month", M),
  ]);
  const rows: (string | number)[][] = [["직원", "콜수", "성공", "개통", "콜목표", "개통목표", "달성률(%)"]];
  for (const u of sf.data ?? []) {
    const ul = (lg.data ?? []).filter((l) => l.staff_id === u.id);
    const success = ul.filter((l) => l.result === "interested" || l.result === "activated").length;
    const activated = ul.filter((l) => l.is_activation).length;
    const t = (tg.data ?? []).find((x) => x.user_id === u.id);
    const target = t?.activation_target ?? 0;
    rows.push([u.display_name, ul.length, success, activated, t?.call_target ?? 0, target, target ? Math.round((activated / target) * 100) : 0]);
  }
  downloadCSV(`직원성과_${Y}-${String(M).padStart(2,"0")}.csv`, rows);
  toast.success("내보내기 완료");
}

const reports = [
  { key: "calls", title: "콜 로그 전체", desc: "모든 콜 기록", icon: PhoneCall, fn: exportCalls },
  { key: "customers", title: "고객 명단", desc: "전체 고객 정보", icon: Users, fn: exportCustomers },
  { key: "staff", title: "직원 월간 성과", desc: "이번 달 직원 실적", icon: Users, fn: exportStaffMonthly },
];

function Reports() {
  return (
    <div className="space-y-5">
      <PageHeader title="리포트" description="원하는 리포트를 CSV로 내보내세요 (Excel에서 바로 열림)" />
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
                <Download className="mr-2 h-4 w-4" /> CSV 다운로드
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          국가별 / 채널별 상세 분석은 좌측 메뉴의 <strong>국가별 성과</strong>, <strong>채널별 성과</strong> 페이지를 참고하세요.
        </CardContent>
      </Card>
    </div>
  );
}
