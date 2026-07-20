import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function AiChatPanel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (!session) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "" }]);

    try {
      const payload = {
        sessionId: sessionIdRef.current,
        messages: nextMessages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text", text: m.text }],
        })),
      };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "");
        setMessages((m) =>
          m.map((x) =>
            x.id === assistantId ? { ...x, text: `⚠️ ${err || res.statusText}` } : x,
          ),
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) =>
          m.map((x) => (x.id === assistantId ? { ...x, text: acc } : x)),
        );
      }
    } catch (e) {
      setMessages((m) =>
        m.map((x) =>
          x.id === assistantId
            ? { ...x, text: `⚠️ ${e instanceof Error ? e.message : "error"}` }
            : x,
        ),
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div style={style} className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">AI 어시스턴트</span>
          <span className="text-[10px] text-muted-foreground">한국어 · English · O'zbekcha · Русский</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            setMessages([]);
            sessionIdRef.current = crypto.randomUUID();
          }}
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
            <p>고객 검색, 오늘 통화 통계, 상태별 조회, 메모 추가 등을 도와드립니다.</p>
            <p className="opacity-70">예: "오늘 콜 제일 많이 한 직원", "010-1234-5678 검색", "부재중 고객 리스트"</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {m.text || (loading ? "…" : "")}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.text === "" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="질문을 입력하세요…"
          className="max-h-40 min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
