import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "primary" | "success" | "warning" | "destructive" | "info" | "muted";

const tones: Record<Tone, string> = {
  primary: "bg-primary/8 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-brand/10 text-brand",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
  muted: "bg-muted text-muted-foreground",
};

const bars: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-brand",
  destructive: "bg-destructive",
  info: "bg-info",
  muted: "bg-muted-foreground/40",
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
    <Card className="group relative overflow-hidden rounded-lg border-border bg-card shadow-[var(--shadow-card)] transition-colors hover:border-brand/60">
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", bars[tone])} />
      <CardContent className="flex items-start justify-between gap-3 p-3.5 pl-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
          <span className="font-display text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground">
            {value}
            {suffix && (
              <span className="ml-1 text-xs font-semibold text-muted-foreground">{suffix}</span>
            )}
          </span>
          {hint && <span className="text-[11px] font-medium text-muted-foreground">{hint}</span>}
        </div>
        {Icon && (
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", tones[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
