import { useState } from "react";
import { Bot, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AiChatPanel } from "@/components/AiChatPanel";
import { cn } from "@/lib/utils";

export function AiAssistant() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);

  if (!session) return null;

  return (
    <>
      <button
        type="button"
        aria-label="AI Assistant"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {open && (
        <AiChatPanel
          className={cn(
            "fixed z-40 shadow-2xl",
            "bottom-20 right-4 h-[70vh] w-[calc(100vw-2rem)] max-w-[400px] sm:h-[520px]",
          )}
        />
      )}
    </>
  );
}
