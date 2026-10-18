import { useTranslation } from "react-i18next";
import { dashboardDelta } from "@/lib/dashboard-presentation";
import { cn } from "@/lib/utils";

export function KpiDelta({
  current,
  previous,
  decreaseIsGood = false,
  ready,
}: {
  current: number;
  previous: number;
  decreaseIsGood?: boolean;
  ready: boolean;
}) {
  const { t } = useTranslation();
  const delta = ready ? dashboardDelta(current, previous, decreaseIsGood) : null;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <span
        className={cn(
          "font-semibold tabular-nums",
          delta?.good === true
            ? "text-success"
            : delta?.good === false
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      >
        {delta
          ? `${delta.percent > 0 ? "▲" : delta.percent < 0 ? "▼" : ""} ${Math.abs(delta.percent).toFixed(1)}%`
          : "—"}
      </span>
      <span className="text-muted-foreground">{t("dashboard.deltaVsPrev")}</span>
    </span>
  );
}
