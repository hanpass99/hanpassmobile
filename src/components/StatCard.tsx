import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "primary" | "success" | "warning" | "destructive" | "info" | "muted";

const tiles: Record<Tone, string> = {
  primary: "border-primary/30 bg-primary/5",
  success: "border-success/25 bg-success/10",
  warning: "border-warning/25 bg-warning/10",
  destructive: "border-destructive/25 bg-destructive/10",
  info: "border-info/25 bg-info/10",
  muted: "border-border bg-muted/60",
};

const labels: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
  muted: "text-muted-foreground",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  suffix,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  suffix?: string;
}) {
  return (
    <div
      className={cn(
        "group flex items-start justify-between gap-3 rounded-md border p-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]",
        tiles[tone],
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className={cn("truncate text-[11px] font-medium tracking-normal", labels[tone])}>
          {label}
        </span>
        <span className="font-display text-[22px] font-semibold leading-none tracking-normal tabular-nums text-foreground">
          {value}
          {suffix && (
            <span className="ml-1 text-xs font-medium text-muted-foreground">{suffix}</span>
          )}
        </span>
        {hint && <span className="text-[11px] font-medium text-muted-foreground">{hint}</span>}
      </div>
      {Icon && (
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-card/80", labels[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
