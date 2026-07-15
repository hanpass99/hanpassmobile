import i18n from "@/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/sms")({
  head: () => ({ meta: [{ title: i18n.t("head.sms") }] }),
  pendingComponent: SmsPending,
});

function SmsPending() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded border p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr,420px]">
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <div className="rounded border space-y-3 p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
