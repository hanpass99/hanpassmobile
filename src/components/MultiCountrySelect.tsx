import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type CountryOpt = { id: string; code: string; name_ko: string };

export function MultiCountrySelect({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  options: CountryOpt[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-8 min-w-[140px] justify-between gap-1 px-2 font-normal", className)}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 overflow-hidden">
            {value.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {placeholder ?? t("settings.allCountriesNoLimit")}
              </span>
            ) : (
              <>
                {value.slice(0, 3).map((id) => {
                  const c = options.find((o) => o.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {c?.code ?? "?"}
                    </Badge>
                  );
                })}
                {value.length > 3 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    +{value.length - 3}
                  </Badge>
                )}
              </>
            )}
          </div>
          {value.length > 0 ? (
            <X className="h-3 w-3 shrink-0 opacity-50 hover:opacity-100" onClick={clear} />
          ) : (
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <div className="max-h-[280px] overflow-y-auto p-1">
          {options.map((c) => {
            const checked = value.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} />
                <span className="font-mono text-xs font-bold text-primary">{c.code}</span>
                <span className="text-xs">{c.name_ko}</span>
                {checked && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
