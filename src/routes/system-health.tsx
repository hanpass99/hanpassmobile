import i18n from "@/i18n";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  useRunSystemChecks,
  useSystemChecks,
  type CheckStatus,
  type SystemCheckRow,
} from "@/hooks/use-system-health";

export const Route = createFileRoute("/system-health")({
  head: () => ({
    meta: [
      { title: i18n.t("systemHealth.headTitle") },
      { name: "description", content: i18n.t("systemHealth.headDesc") },
      { property: "og:title", content: i18n.t("systemHealth.headTitle") },
      { property: "og:description", content: i18n.t("systemHealth.headDesc") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SystemHealthPage,
});

const CATEGORY_ORDER = ["consistency", "data", "integration", "system"] as const;

const STATUS_RANK: Record<CheckStatus, number> = { error: 0, warn: 1, ok: 2 };

function statusBadge(status: CheckStatus, label: string) {
  const cls =
    status === "error"
      ? "bg-red-500 hover:bg-red-500 text-white"
      : status === "warn"
        ? "bg-amber-500 hover:bg-amber-500 text-white"
        : "bg-emerald-500 hover:bg-emerald-500 text-white";
  return <Badge className={cls}>{label}</Badge>;
}

function SystemHealthPage() {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const { data: rows = [], isLoading } = useSystemChecks(isAdmin);
  const run = useRunSystemChecks();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" />;

  const counts = {
    ok: rows.filter((r) => r.status === "ok").length,
    warn: rows.filter((r) => r.status === "warn").length,
    error: rows.filter((r) => r.status === "error").length,
  };
  const lastChecked = rows.reduce<string | null>(
    (acc, r) => (acc && acc > r.checked_at ? acc : r.checked_at),
    null,
  );

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: rows
      .filter((r) => r.category === cat)
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.check_key.localeCompare(b.check_key)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader title={t("systemHealth.title")} description={t("systemHealth.subtitle")} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="text-sm text-muted-foreground">
            {t("systemHealth.lastChecked")}:{" "}
            {lastChecked ? format(new Date(lastChecked), "yyyy-MM-dd HH:mm") : t("systemHealth.never")}
          </div>
          <Button
            size="sm"
            className="ml-auto"
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", run.isPending && "animate-spin")} />
            {run.isPending ? t("systemHealth.running") : t("systemHealth.runNow")}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t("systemHealth.errorCount")} value={counts.error} icon={XCircle} tone={counts.error ? "primary" : "muted"} />
        <StatCard label={t("systemHealth.warnCount")} value={counts.warn} icon={AlertTriangle} tone={counts.warn ? "info" : "muted"} />
        <StatCard label={t("systemHealth.okCount")} value={counts.ok} icon={CheckCircle2} tone="success" />
      </div>

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t("systemHealth.empty")}
          </CardContent>
        </Card>
      )}

      {counts.error === 0 && counts.warn === 0 && rows.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {t("systemHealth.allGood")}
        </div>
      )}

      {byCategory.map((group) => (
        <Card key={group.cat}>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              {t(`systemHealth.cat.${group.cat}`)}
            </div>
            <div className="space-y-2">
              {group.items.map((item: SystemCheckRow) => (
                <div
                  key={item.check_key}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm",
                    item.status === "error" && "border-red-500/40 bg-red-500/5",
                    item.status === "warn" && "border-amber-500/40 bg-amber-500/5",
                  )}
                >
                  {statusBadge(item.status, t(`systemHealth.${item.status}`))}
                  <span className="min-w-0 flex-1 break-words">{item.message}</span>
                  {item.metric != null && (
                    <span className="text-xs font-semibold text-muted-foreground">{Number(item.metric)}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(item.checked_at), "MM-dd HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">{t("systemHealth.autoNote")}</p>
    </div>
  );
}
