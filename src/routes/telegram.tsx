import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Search,
  Send,
  UserPlus,
  CheckCircle2,
  Link2Off,
  MessageCircle,
  Settings,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  sendTelegramReply,
  markTelegramChatRead,
  linkTelegramChatToCustomer,
  searchCustomersForTelegram,
  registerTelegramWebhook,
} from "@/lib/telegram.functions";

type Chat = {
  id: string;
  chat_id: number;
  customer_id: string | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_matched: boolean;
};

type Message = {
  id: string;
  telegram_chat_row_id: string;
  direction: "in" | "out";
  text: string | null;
  caption: string | null;
  message_type: string | null;
  media_storage_path: string | null;
  media_file_name: string | null;
  media_mime: string | null;
  media_size: number | null;
  media_width: number | null;
  media_height: number | null;
  media_duration: number | null;
  sent_by: string | null;
  created_at: string;
};


type Profile = { id: string; display_name: string | null; avatar_url: string | null };

export const Route = createFileRoute("/telegram")({
  head: () => ({
    meta: [
      { title: "텔레그램 상담 — Hanpass OB CRM" },
      { name: "description", content: "텔레그램 고객 상담 통합 채팅" },
    ],
  }),
  component: TelegramPage,
});

function chatDisplayName(c: Chat): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || c.telegram_username || `Chat ${c.chat_id}`;
}

function TelegramPage() {
  const { i18n: i18nInst } = useTranslation();
  const { isAdmin } = useAuth();
  const locale = i18nInst.language === "ko" ? ko : enUS;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "matched" | "unmatched">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Fetch chats
  const chatsQuery = useQuery({
    queryKey: ["telegram-chats"],
    queryFn: async (): Promise<Chat[]> => {
      const { data, error } = await supabase
        .from("telegram_chats")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Chat[];
    },
  });

  // Realtime: refresh chats & messages
  useEffect(() => {
    const channel = supabase
      .channel("telegram-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telegram_chats" },
        () => qc.invalidateQueries({ queryKey: ["telegram-chats"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "telegram_messages" },
        (payload) => {
          const row = payload.new as { telegram_chat_row_id: string };
          qc.invalidateQueries({ queryKey: ["telegram-messages", row.telegram_chat_row_id] });
          qc.invalidateQueries({ queryKey: ["telegram-chats"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const chats = chatsQuery.data ?? [];
  const filtered = useMemo(() => {
    let list = chats;
    if (filterTab === "matched") list = list.filter((c) => c.is_matched);
    else if (filterTab === "unmatched") list = list.filter((c) => !c.is_matched);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((c) => {
        return (
          chatDisplayName(c).toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.telegram_username ?? "").toLowerCase().includes(q) ||
          (c.last_message_preview ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [chats, filterTab, searchTerm]);

  const selected = filtered.find((c) => c.id === selectedId) ?? chats.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h1 className="text-lg font-semibold">텔레그램 상담 · Telegram Chat</h1>
          <Badge variant="secondary">{chats.length}</Badge>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="mr-1 h-4 w-4" /> 웹훅 설정
          </Button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[340px_1fr]">
        {/* Left: chat list */}
        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름, 번호, 메시지 검색"
                className="pl-8 h-9"
              />
            </div>
            <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as typeof filterTab)} className="mt-2">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">전체</TabsTrigger>
                <TabsTrigger value="matched">매칭됨</TabsTrigger>
                <TabsTrigger value="unmatched">
                  미매칭
                  {chats.filter((c) => !c.is_matched).length > 0 && (
                    <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                      {chats.filter((c) => !c.is_matched).length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <ScrollArea className="flex-1">
            {chatsQuery.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">대화가 없습니다.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition",
                      selectedId === c.id && "bg-accent",
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {chatDisplayName(c).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{chatDisplayName(c)}</span>
                        {c.last_message_at && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false, locale })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="truncate flex-1 text-xs text-muted-foreground">
                          {c.last_message_preview ?? "(no preview)"}
                        </p>
                        {c.unread_count > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {c.is_matched ? (
                          <Badge variant="outline" className="h-4 gap-0.5 border-green-500/30 px-1 text-[9px] text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-2.5 w-2.5" /> 매칭
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-4 gap-0.5 border-amber-500/30 px-1 text-[9px] text-amber-700 dark:text-amber-400">
                            <Link2Off className="h-2.5 w-2.5" /> 미매칭
                          </Badge>
                        )}
                        {c.telegram_username && (
                          <span className="text-[10px] text-muted-foreground">@{c.telegram_username}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: conversation */}
        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          {selected ? (
            <ConversationPane chat={selected} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              왼쪽에서 대화를 선택하세요.
            </div>
          )}
        </div>
      </div>

      {showSettings && <WebhookSettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function ConversationPane({ chat }: { chat: Chat }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["telegram-messages", chat.id],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("telegram_messages")
        .select(
          "id, telegram_chat_row_id, direction, text, caption, message_type, media_storage_path, media_file_name, media_mime, media_size, media_width, media_height, media_duration, sent_by, created_at",
        )
        .eq("telegram_chat_row_id", chat.id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Message[];

    },
  });

  // Load profiles for sent_by
  const senderIds = useMemo(
    () => Array.from(new Set((messagesQuery.data ?? []).map((m) => m.sent_by).filter((x): x is string => !!x))),
    [messagesQuery.data],
  );
  const profilesQuery = useQuery({
    queryKey: ["telegram-sender-profiles", senderIds.join(",")],
    enabled: senderIds.length > 0,
    queryFn: async (): Promise<Record<string, Profile>> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", senderIds);
      const map: Record<string, Profile> = {};
      for (const p of data ?? []) map[p.id] = p as Profile;
      return map;
    },
  });

  // Customer info
  const customerQuery = useQuery({
    queryKey: ["telegram-customer", chat.customer_id],
    enabled: !!chat.customer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, status, country_id")
        .eq("id", chat.customer_id!)
        .maybeSingle();
      return data;
    },
  });

  const markRead = useServerFn(markTelegramChatRead);
  const sendReply = useServerFn(sendTelegramReply);
  const unlinkFn = useServerFn(linkTelegramChatToCustomer);

  // Mark read on open
  useEffect(() => {
    if (chat.unread_count > 0) {
      markRead({ data: { chatRowId: chat.id } })
        .then(() => qc.invalidateQueries({ queryKey: ["telegram-chats"] }))
        .catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesQuery.data]);

  const sendMut = useMutation({
    mutationFn: async (msg: string) => {
      return sendReply({ data: { chatRowId: chat.id, text: msg } });
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["telegram-messages", chat.id] });
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "전송 실패"),
  });

  const unlinkMut = useMutation({
    mutationFn: async () => unlinkFn({ data: { chatRowId: chat.id, customerId: null } }),
    onSuccess: () => {
      toast.success("연결 해제됨");
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    },
  });

  const onSubmit = () => {
    const t = text.trim();
    if (!t || sendMut.isPending) return;
    sendMut.mutate(t);
  };

  const profileMap = profilesQuery.data ?? {};

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{chatDisplayName(chat)}</span>
            {chat.telegram_username && (
              <span className="text-xs text-muted-foreground">@{chat.telegram_username}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {customerQuery.data ? (
              <span className="text-green-700 dark:text-green-400">
                ✓ CRM 고객: {customerQuery.data.name} ({customerQuery.data.phone})
              </span>
            ) : chat.phone ? (
              <span className="text-amber-600">공유 번호: {chat.phone} · 미매칭</span>
            ) : (
              <span className="text-amber-600">미매칭 — 고객 연결이 필요합니다</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {chat.customer_id ? (
            <Button size="sm" variant="ghost" onClick={() => unlinkMut.mutate()}>
              <Link2Off className="mr-1 h-4 w-4" /> 연결 해제
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowLinkDialog(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> 고객 연결
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messagesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">불러오는 중...</div>
        ) : (messagesQuery.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">아직 메시지가 없습니다.</div>
        ) : (
          (messagesQuery.data ?? []).map((m) => {
            const isOut = m.direction === "out";
            const sender = m.sent_by ? profileMap[m.sent_by] : null;
            const isMine = isOut && m.sent_by === user?.id;
            return (
              <div key={m.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%]", isOut && "flex flex-col items-end")}>
                  {isOut && (
                    <div className="mb-0.5 text-[10px] text-muted-foreground">
                      {sender?.display_name ?? "직원"} {isMine && "(나)"}
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                      isOut
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    <MessageBody m={m} />
                  </div>

                  <div className={cn("mt-0.5 text-[10px] text-muted-foreground", isOut ? "text-right" : "text-left")}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)"
            rows={2}
            className="resize-none"
            disabled={sendMut.isPending}
          />
          <Button onClick={onSubmit} disabled={sendMut.isPending || !text.trim()} size="icon" className="h-10 w-10">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showLinkDialog && (
        <LinkCustomerDialog chat={chat} onClose={() => setShowLinkDialog(false)} />
      )}
    </>
  );
}

function useSignedMediaUrl(path: string | null) {
  return useQuery({
    queryKey: ["telegram-media-url", path],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("telegram-media")
        .createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

function humanSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function MessageBody({ m }: { m: Message }) {
  const kind = m.message_type ?? "text";
  const mediaQ = useSignedMediaUrl(m.media_storage_path);
  const url = mediaQ.data;
  const caption = m.caption ?? null;

  if (kind === "text" || (!m.media_storage_path && m.text)) {
    return <>{m.text ?? m.caption ?? "(비어있음)"}</>;
  }

  const captionEl = caption ? (
    <div className="mt-1.5 whitespace-pre-wrap break-words">{caption}</div>
  ) : null;

  if (kind === "photo" || kind === "sticker") {
    return (
      <div>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={caption ?? "photo"}
              className="max-h-80 max-w-full rounded-lg object-contain"
              loading="lazy"
            />
          </a>
        ) : (
          <div className="opacity-70">📷 Loading photo…</div>
        )}
        {captionEl}
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div>
        {url ? (
          <video src={url} controls className="max-h-80 max-w-full rounded-lg" preload="metadata" />
        ) : (
          <div className="opacity-70">🎬 Loading video…</div>
        )}
        {captionEl}
      </div>
    );
  }

  if (kind === "voice" || kind === "audio") {
    return (
      <div>
        {url ? (
          <audio src={url} controls className="max-w-full" preload="metadata" />
        ) : (
          <div className="opacity-70">🎤 Loading audio…</div>
        )}
        {captionEl}
      </div>
    );
  }

  // document or other
  return (
    <div>
      <a
        href={url ?? "#"}
        target="_blank"
        rel="noreferrer"
        download={m.media_file_name ?? undefined}
        className="flex items-center gap-2 underline underline-offset-2"
        onClick={(e) => {
          if (!url) e.preventDefault();
        }}
      >
        📎 <span className="break-all">{m.media_file_name ?? "File"}</span>
        {m.media_size ? <span className="opacity-70 text-xs">({humanSize(m.media_size)})</span> : null}
      </a>
      {captionEl}
    </div>
  );
}



function LinkCustomerDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState(chat.phone ?? "");
  const searchFn = useServerFn(searchCustomersForTelegram);
  const linkFn = useServerFn(linkTelegramChatToCustomer);

  const searchMut = useMutation({
    mutationFn: async (query: string) => searchFn({ data: { query } }),
  });

  const linkMut = useMutation({
    mutationFn: async (customerId: string) =>
      linkFn({ data: { chatRowId: chat.id, customerId } }),
    onSuccess: () => {
      toast.success("고객이 연결되었습니다");
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실패"),
  });

  useEffect(() => {
    if (q.trim().length >= 2) searchMut.mutate(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>고객 연결</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 또는 전화번호로 검색"
              onKeyDown={(e) => e.key === "Enter" && searchMut.mutate(q)}
            />
            <Button onClick={() => searchMut.mutate(q)} disabled={searchMut.isPending}>
              검색
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto rounded border">
            {searchMut.data?.customers?.length ? (
              searchMut.data.customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => linkMut.mutate(c.id)}
                  disabled={linkMut.isPending}
                  className="flex w-full items-center justify-between border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent"
                >
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.phone} · {c.status ?? "-"}
                    </div>
                  </div>
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchMut.isPending ? "검색 중..." : "결과가 없습니다."}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhookSettingsDialog({ onClose }: { onClose: () => void }) {
  const defaultUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/telegram/webhook`
      : "";
  const [url, setUrl] = useState(defaultUrl);
  const registerFn = useServerFn(registerTelegramWebhook);
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: async () => registerFn({ data: { webhookUrl: url } }),
    onSuccess: (data) => {
      setResult(data);
      toast.success(`웹훅 등록됨: @${(data as any).bot?.username}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실패"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>텔레그램 웹훅 설정</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            BotFather에서 봇을 만든 후, 아래 URL을 텔레그램에 웹훅으로 등록하세요. 등록되면 고객이 봇에게 메시지를 보낼 때 CRM에 자동으로 나타납니다.
          </p>
          <div>
            <label className="text-xs font-medium">Webhook URL</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              팁: 배포된 URL(예: https://hanpassmobile.lovable.app/api/public/telegram/webhook)을 사용하세요.
            </p>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !url} className="w-full">
            {mut.isPending ? "등록 중..." : "웹훅 등록"}
          </Button>
          {result && (
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
