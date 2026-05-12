import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  url,
  className,
}: {
  name?: string | null;
  url?: string | null;
  className?: string;
}) {
  const initial = (name || "U").trim().charAt(0).toUpperCase();
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {url ? <AvatarImage src={url} alt={name ?? ""} /> : null}
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
