import { createFileRoute } from "@tanstack/react-router";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  RotateCw,
  CheckCircle2,
  TrendingUp,
  Target,
  Award,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  CHANNELS,
  COUNTRIES,
  CUSTOMERS,
  MONTHLY_TARGET_TOTAL,
  STAFF,
  computeStats,
  dailyTrend,
  monthlyTrend,
} from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "대시보드 — Hanpass Mobile OB Call CRM" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const s = computeStats();
  const achievement = (s.activated / MONTHLY_TARGET_TOTAL) * 100;

  const channelData = CHANNELS.map((ch) => {
    const cs = computeStats(CUSTOMERS.filter((c) => c.channel === ch));
    return { name: ch.replace("한패스 ", ""), 콜수: cs.totalCalls, 개통: cs.activated };
  });

  const countryData = COUNTRIES.map((co) => {
    const cs = computeStats(CUSTOMERS.filter((c) => c.country === co.code));
    return { name: co.code, value: cs.activated };
  }).sort((a, b) => b.value - a.value).slice(0, 8);

  const staffRanking = STAFF.filter((u) => u.role === "staff")
    .map((u) => {
      const cs = computeStats(CUSTOMERS.filter((c) => c.assignedStaffId === u.id));
      return { ...u, ...cs };
    })
    .sort((a, b) => b.activated - a.activated);

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  return (
    <div className="space-y-6">
      <PageHeader title="대시보드" description="OB 콜 운영 현황을 한눈에 확인하세요" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="전체 콜수" value={s.totalCalls.toLocaleString()} icon={PhoneCall} tone="primary" />
        <StatCard label="성공 콜" value={s.success} icon={PhoneIncoming} tone="success" />
        <StatCard label="실패 콜" value={s.failed} icon={PhoneOff} tone="destructive" />
        <StatCard label="부재중" value={s.missed} icon={PhoneMissed} tone="warning" />
        <StatCard label="재연락 필요" value={s.recall} icon={RotateCw} tone="info" />
        <StatCard label="개통 완료" value={s.activated} icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard
          label="콜 성공률"
          value={s.successRate.toFixed(1)}
          suffix="%"
          icon={TrendingUp}
          tone="primary"
          hint="성공 콜 / 전체 콜"
        />
        <StatCard
          label="개통 성공률"
          value={s.activationRate.toFixed(1)}
          suffix="%"
          icon={Award}
          tone="success"
          hint="개통 완료 / 전체 콜"
        />
        <StatCard
          label="월 목표 달성률"
          value={achievement.toFixed(1)}
          suffix="%"
          icon={Target}
          tone="info"
          hint={`${s.activated} / ${MONTHLY_TARGET_TOTAL}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>일별 콜 추이</CardTitle>
            <CardDescription>최근 14일</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend()}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="calls" name="콜수" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="success" name="성공" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="activated" name="개통" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>국가별 개통 분포</CardTitle>
            <CardDescription>상위 8개국</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={countryData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {countryData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>월별 콜 추이</CardTitle>
            <CardDescription>최근 6개월</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="calls" name="콜수" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="activated" name="개통" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>채널별 성과</CardTitle>
            <CardDescription>콜수 vs 개통수</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={11} width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="콜수" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                <Bar dataKey="개통" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>직원 랭킹</CardTitle>
          <CardDescription>이번 달 개통 실적 기준</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {staffRanking.map((u, i) => {
              const pct = (u.activated / u.monthlyTarget) * 100;
              return (
                <div key={u.id} className="flex items-center gap-4 rounded-lg border border-border/60 p-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                      i === 0
                        ? "bg-warning/20 text-warning-foreground"
                        : i === 1
                          ? "bg-muted text-foreground"
                          : i === 2
                            ? "bg-destructive/15 text-destructive"
                            : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{u.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {u.activated} / {u.monthlyTarget} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress value={Math.min(100, pct)} className="mt-2 h-2" />
                  </div>
                  <div className="hidden gap-6 text-xs sm:flex">
                    <div>
                      <div className="text-muted-foreground">콜수</div>
                      <div className="font-semibold">{u.totalCalls}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">성공률</div>
                      <div className="font-semibold">{u.successRate.toFixed(0)}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
