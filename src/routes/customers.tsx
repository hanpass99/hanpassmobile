import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

type CustomersSearch = {
  status?: string;
  country?: string;
  from?: string;
  to?: string;
  pool?: string;
};

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "고객 관리 — Hanpass OB CRM" }] }),
  validateSearch: (search: Record<string, unknown>): CustomersSearch => ({
    status: typeof search.status === "string" ? search.status : undefined,
    country: typeof search.country === "string" ? search.country : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    pool: typeof search.pool === "string" ? search.pool : undefined,
  }),
  pendingComponent: CustomersPending,
});

function CustomersPending() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-[200px]" />
        <Skeleton className="h-9 w-[140px]" />
        <Skeleton className="h-9 w-[140px]" />
        <Skeleton className="h-9 w-[140px]" />
        <Skeleton className="h-9 w-[180px]" />
        <Skeleton className="h-9 w-[180px]" />
      </div>
      <div className="rounded border">
        <div className="flex gap-2 p-3 border-b">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-2 p-3 border-b last:border-b-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
