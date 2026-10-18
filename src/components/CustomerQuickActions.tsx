import { Link } from "@tanstack/react-router";
import { MessageSquare, Phone, ListFilter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CUSTOMER_STATUSES, STATUS_LABEL, type CustomerStatus } from "@/lib/labels";
import type { CustomerRow } from "@/hooks/use-customers";

export function CustomerQuickActions({
  customer,
  telHref,
  onCall,
  onStatus,
  userId,
  canSms,
}: {
  customer: CustomerRow;
  telHref: string;
  onCall: () => void;
  onStatus: (status: CustomerStatus) => void;
  userId?: string;
  canSms: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a
              href={telHref}
              aria-label={t("customers.quickCallAction")}
              onClick={() => window.setTimeout(onCall, 1500)}
            >
              <Phone className="h-4 w-4" />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("customers.quickCallAction")}</TooltipContent>
      </Tooltip>
      {canSms && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link
                to="/sms"
                aria-label={t("customers.quickSms")}
                onClick={() => {
                  if (!userId) return;
                  try {
                    sessionStorage.setItem(`sms.prefill.${userId}`, customer.phone);
                  } catch {
                    /* storage unavailable */
                  }
                }}
              >
                <MessageSquare className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("customers.quickSms")}</TooltipContent>
        </Tooltip>
      )}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                data-quick-status
                aria-label={t("customers.quickStatus")}
              >
                <ListFilter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("customers.quickStatus")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {CUSTOMER_STATUSES.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={status === customer.status}
              onSelect={() => onStatus(status)}
            >
              {STATUS_LABEL[status]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
