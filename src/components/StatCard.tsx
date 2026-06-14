import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "primary" | "success" | "warning" | "destructive" | "info" | "muted";

const tones: Record<Tone, string> = {
  primary: "bg-[#DBEAFE] text-[#2563EB]",
  success: "bg-[#DCFCE7] text-[#15803D]",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-[#E0F2FE] text-[#0369A1]",
  muted: "bg-[#EFF6FF] text-[#1E3A5F]",
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
    <Card className="rounded-lg border-border/80 bg-card shadow-none transition-colors hover:bg-accent/40" style={{ borderWidth: "0.5px" }}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="text-[22px] font-medium leading-tight tracking-tight text-primary">
            {value}
            {suffix && <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span>}
          </span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
        {Icon && (
          <div className={cn("flex h-[34px] w-[34px] items-center justify-center rounded-md", tones[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
