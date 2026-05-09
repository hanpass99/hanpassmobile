import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileBarChart, CalendarDays, Users, Globe2, Radio } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "리포트 — Hanpass OB CRM" }] }),
  component: Reports,
});

const reports = [
  { key: "daily", title: "일간 리포트", desc: "오늘의 콜 실적과 개통 현황", icon: CalendarDays },
  { key: "weekly", title: "주간 리포트", desc: "최근 7일 트렌드 및 직원 성과", icon: FileBarChart },
  { key: "monthly", title: "월간 리포트", desc: "월 목표 대비 달성 현황", icon: CalendarDays },
  { key: "staff", title: "직원 리포트", desc: "직원별 콜 및 개통 실적", icon: Users },
  { key: "country", title: "국가 리포트", desc: "국가별 성과 분석", icon: Globe2 },
  { key: "channel", title: "채널 리포트", desc: "채널별 효율 분석", icon: Radio },
];

function Reports() {
  return (
    <div className="space-y-5">
      <PageHeader title="리포트" description="원하는 리포트를 선택해 Excel로 내보내세요" />
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
            <CardContent className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => toast.success(`${r.title} CSV 다운로드 (목업)`)}>
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
              <Button size="sm" className="flex-1" onClick={() => toast.success(`${r.title} Excel 다운로드 (목업)`)}>
                <Download className="mr-2 h-4 w-4" /> Excel
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
