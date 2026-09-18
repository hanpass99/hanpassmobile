export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 pb-2 max-sm:grid-cols-1">
      <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold tracking-normal text-foreground sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 text-xs font-normal leading-relaxed text-muted-foreground sm:text-sm">{description}</p>
          )}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full [&>*]:max-sm:flex-1">{actions}</div>}
    </div>
  );
}
