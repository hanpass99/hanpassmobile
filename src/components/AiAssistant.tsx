import { useEffect, useRef, useState } from "react";
import { Bot, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AiChatPanel } from "@/components/AiChatPanel";
import { cn } from "@/lib/utils";

type Pos = { x: number; y: number };
const STORAGE_KEY = "ai-assistant-pos";
const BTN_SIZE = 56;

export function AiAssistant() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);

  // Load saved position, default to bottom-right
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Pos;
        setPos(clamp(p));
        return;
      }
    } catch {
      /* noop */
    }
    setPos({
      x: window.innerWidth - BTN_SIZE - 16,
      y: window.innerHeight - BTN_SIZE - 16,
    });
  }, []);

  // Keep in viewport on resize
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function clamp(p: Pos): Pos {
    const maxX = Math.max(0, window.innerWidth - BTN_SIZE - 4);
    const maxY = Math.max(0, window.innerHeight - BTN_SIZE - 4);
    return {
      x: Math.min(Math.max(4, p.x), maxX),
      y: Math.min(Math.max(4, p.y), maxY),
    };
  }

  if (!session || !pos) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragState.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.moved && Math.hypot(dx, dy) < 5) return;
    s.moved = true;
    setPos(clamp({ x: s.origX + dx, y: s.origY + dy }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragState.current;
    if (!s) return;
    const moved = s.moved;
    dragState.current = null;
    try {
      (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (moved) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
      } catch {
        /* noop */
      }
    } else {
      setOpen((v) => !v);
    }
  };

  // Panel placement: prefer above, else below; align to button edge
  const panelWidth = Math.min(400, window.innerWidth - 16);
  const panelMaxHeight = Math.min(560, window.innerHeight - 32);
  const spaceAbove = pos.y - 8;
  const spaceBelow = window.innerHeight - (pos.y + BTN_SIZE) - 8;
  const openAbove = spaceAbove >= 300 || spaceAbove >= spaceBelow;
  const panelHeight = Math.min(panelMaxHeight, openAbove ? spaceAbove : spaceBelow);
  const panelLeft = Math.min(
    Math.max(8, pos.x + BTN_SIZE - panelWidth),
    window.innerWidth - panelWidth - 8,
  );
  const panelTop = openAbove ? pos.y - panelHeight - 8 : pos.y + BTN_SIZE + 8;

  return (
    <>
      <button
        type="button"
        aria-label="AI Assistant"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ left: pos.x, top: pos.y, width: BTN_SIZE, height: BTN_SIZE, touchAction: "none" }}
        className={cn(
          "fixed z-40 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 cursor-grab active:cursor-grabbing",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {open && (
        <AiChatPanel
          className="fixed z-40 shadow-2xl"
          style={{
            left: panelLeft,
            top: panelTop,
            width: panelWidth,
            height: panelHeight,
          }}
        />
      )}
    </>
  );
}
