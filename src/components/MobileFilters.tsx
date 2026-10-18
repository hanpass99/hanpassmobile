import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Only one copy of the controls is mounted; their owning page retains filter state. */
export function MobileFilters({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  const { t } = useTranslation();
  if (!mobile) return <>{children}</>;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full">
          <SlidersHorizontal />
          {t("mobile.filters")}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="mobile-filter-sheet flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("mobile.filters")}</SheetTitle>
        </SheetHeader>
        <div className="mobile-filter-controls min-w-0 space-y-4 pt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
