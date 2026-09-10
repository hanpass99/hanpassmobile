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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex items-center gap-3">
        <span className="h-7 w-1 rounded-full bg-brand" />
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
