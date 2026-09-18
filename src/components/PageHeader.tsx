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
    <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
      <div>
          <h1 className="font-display text-xl font-semibold tracking-normal text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-xs font-normal text-muted-foreground">{description}</p>
          )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
