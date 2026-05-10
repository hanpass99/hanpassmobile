import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/lib/labels";

export const Route = createFileRoute("/staff-performance")({
  head: () => ({ meta: [{ title: "직원 성과 — Hanpass OB CRM" }] }),
  component: StaffPerf,
});

type Counts = Record<CustomerStatus, number>;
type TierKey = "diamond" | "platinum" | "gold" | "silver" | "bronze" | "rookie";
type Tier = { key: TierKey; cls: string };
type Row = { id: string; name: string; total: number; counts: Counts; tier: Tier };

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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
      const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString();
      const [sf, cu, rl] = await Promise.all([
        supabase.from("profiles").select("id, display_name").eq("is_active", true),
        supabase.from("customers").select("assigned_to, status, updated_at").gte("updated_at", fromIso).lte("updated_at", toIso),
        supabase.from("user_roles").select("user_id, role").eq("role", "staff"),
      ]);
      const staffIds = new Set((rl.data ?? []).map((r: any) => r.user_id));
      const staffOnly = (sf.data ?? []).filter((p) => staffIds.has(p.id));
      const out: Row[] = staffOnly.map((u) => {
        const counts = emptyCounts();
        let total = 0;
        for (const c of cu.data ?? []) {
          if (c.assigned_to !== u.id) continue;
          const s = c.status as CustomerStatus;
          if (counts[s] !== undefined) counts[s]++;
          total++;
        }
        return { id: u.id, name: u.display_name, total, counts, tier: tierFor(counts.activated) };
      }).sort((a, b) => b.counts.activated - a.counts.activated || b.total - a.total);
      setRows(out);
      setLoading(false);
    })();
  }, [from, to]);

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
          <Button variant="outline" size="sm" onClick={() => { setFrom(start); setTo(today); }}>
            {t("common.thisMonth")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-12">{t("staffPerf.rank")}</TableHead>
                <TableHead>{t("staffPerf.staff")}</TableHead>
                <TableHead>{t("staffPerf.tier")}</TableHead>
                <TableHead className="text-right">{t("dashboard.totalCalls")}</TableHead>
                {CUSTOMER_STATUSES.map((s) => (
                  <TableHead key={s} className="text-right whitespace-nowrap">{t(`status.${s}`)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u, i) => (
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
              {!rows.length && !loading && (
                <TableRow><TableCell colSpan={4 + CUSTOMER_STATUSES.length} className="text-center py-8 text-sm text-muted-foreground">{t("dashboard.noStaff")}</TableCell></TableRow>
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
