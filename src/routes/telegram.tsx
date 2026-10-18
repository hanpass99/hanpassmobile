import { localizeError } from "@/i18n/localize-error";
import { uiCopy } from "@/i18n/ui-copy";
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
  Link2Off,
  MessageCircle,
  Settings,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Check,
  Paperclip,
  X,
  Reply,
  AlertTriangle,
  Sparkles,
  Ban,
  ShieldCheck,
  ArrowLeft,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  sendTelegramReply,
  sendTelegramMedia,
  editTelegramMessage,
  linkTelegramChatToCustomer,
  searchCustomersForTelegram,
  registerTelegramWebhook,
  setTelegramChatStatus,
  setTelegramChatBanned,
} from "@/lib/telegram.functions";
import {
  markTelegramChatRead,
  setTelegramOperatorTyping,
  dismissAiSuggestion,
} from "@/lib/telegram.functions";

import { useSendSms } from "@/hooks/use-sms";

type ChatStatus = "new" | "in_progress" | "done";

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
  status: ChatStatus;
  assigned_operator_id: string | null;
  is_blocked?: boolean | null;
  banned?: boolean | null;
  banned_reason?: string | null;
  banned_by?: string | null;
  needs_human?: boolean | null;
  needs_human_reason?: string | null;
  ai_suggestion?: string | null;
  ai_suggestion_confidence?: number | null;
  reply_lock_by?: string | null;
  reply_lock_at?: string | null;
};

const REPLY_LOCK_MS = 120_000;

/** 다른 담당자의 답장 잠금이 살아 있으면 남은 초를 반환, 아니면 0 */
function replyLockSecondsLeft(chat: Chat, myId: string | null | undefined, nowMs: number) {
  if (!chat.reply_lock_by || !chat.reply_lock_at) return 0;
  if (myId && chat.reply_lock_by === myId) return 0;
  const left = Math.ceil((new Date(chat.reply_lock_at).getTime() + REPLY_LOCK_MS - nowMs) / 1000);
  return left > 0 ? left : 0;
}

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
  edited_at: string | null;
  telegram_message_id: number | null;
  reply_to_message_id: string | null;
  is_ai_generated?: boolean | null;
};

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

type TemplateMediaType = "none" | "image" | "document";
type Template = {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  media_type: TemplateMediaType;
  media_storage_path: string | null;
  media_file_name: string | null;
  media_mime: string | null;
  media_size: number | null;
};

const TEMPLATE_SELECT =
  "id, title, content, shortcut, media_type, media_storage_path, media_file_name, media_mime, media_size";

const STATUS_LABEL: Record<ChatStatus, string> = {
  get new() {
    return uiCopy("ux.copy884009917a");
  },
  get in_progress() {
    return uiCopy("ux.copy9fdd13d4e6");
  },
  get done() {
    return uiCopy("ux.copy8d8680373c");
  },
};

const STATUS_DOT: Record<ChatStatus, string> = {
  new: "bg-green-500",
  in_progress: "bg-yellow-500",
  done: "bg-gray-400",
};

const STATUS_BADGE: Record<ChatStatus, string> = {
  new: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  in_progress: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  done: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30",
};

export const Route = createFileRoute("/telegram")({
  head: () => ({
    meta: [
      { title: uiCopy("pages.telegram.title") },
      { name: "description", content: uiCopy("pages.telegram.description") },
      { property: "og:title", content: uiCopy("pages.telegram.title") },
      { property: "og:description", content: uiCopy("pages.telegram.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const { isAdmin, user } = useAuth();
  // 1초 간격 틱 — 답장 잠금 카운트다운용
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const locale = i18nInst.language === "ko" ? ko : enUS;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | ChatStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [showSettings, setShowSettings] = useState(false);

  // Fetch chats
  const chatsQuery = useQuery({
    queryKey: ["telegram-chats"],
    staleTime: 10_000,
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

  // Realtime: refresh chats & messages (debounced so bursts don't thrash the UI)
  useEffect(() => {
    let chatsTimer: ReturnType<typeof setTimeout> | null = null;
    const msgTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const invalidateChats = () => {
      if (chatsTimer) return;
      chatsTimer = setTimeout(() => {
        chatsTimer = null;
        qc.invalidateQueries({ queryKey: ["telegram-chats"] });
      }, 400);
    };
    const invalidateMessages = (chatRowId: string) => {
      if (msgTimers.has(chatRowId)) return;
      msgTimers.set(
        chatRowId,
        setTimeout(() => {
          msgTimers.delete(chatRowId);
          qc.invalidateQueries({ queryKey: ["telegram-messages", chatRowId] });
        }, 300),
      );
    };

    const channel = supabase
      .channel("telegram-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telegram_chats" },
        invalidateChats,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "telegram_messages" },
        (payload) => {
          const row = payload.new as { telegram_chat_row_id: string };
          invalidateMessages(row.telegram_chat_row_id);
          invalidateChats();
        },
      )
      .subscribe();
    return () => {
      if (chatsTimer) clearTimeout(chatsTimer);
      msgTimers.forEach((t) => clearTimeout(t));
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const chats = chatsQuery.data ?? [];

  // Load display names for all assigned operators referenced by any chat
  const operatorIds = useMemo(
    () =>
      Array.from(new Set(chats.map((c) => c.assigned_operator_id).filter((x): x is string => !!x))),
    [chats],
  );
  const operatorsQuery = useQuery({
    queryKey: ["telegram-operators", operatorIds.join(",")],
    enabled: operatorIds.length > 0,
    queryFn: async (): Promise<Record<string, Profile>> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", operatorIds);
      const map: Record<string, Profile> = {};
      for (const p of data ?? []) map[p.id] = p as Profile;
      return map;
    },
  });
  const operatorMap = operatorsQuery.data ?? {};

  // Admin: list of all staff for the "operator filter"
  const staffQuery = useQuery({
    queryKey: ["telegram-all-staff"],
    enabled: isAdmin,
    queryFn: async (): Promise<Profile[]> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .order("display_name", { ascending: true });
      return (data ?? []) as Profile[];
    },
  });

  // Admin: chat IDs where a given operator has sent any reply (audit lookup)
  const operatorChatsQuery = useQuery({
    queryKey: ["telegram-chats-by-operator", operatorFilter],
    enabled: isAdmin && operatorFilter !== "all",
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("telegram_messages")
        .select("telegram_chat_row_id")
        .eq("sent_by", operatorFilter)
        .limit(5000);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.telegram_chat_row_id as string));
    },
  });

  const counts = useMemo(() => {
    const c = { all: chats.length, new: 0, in_progress: 0, done: 0 };
    for (const ch of chats) c[ch.status] += 1;
    return c;
  }, [chats]);

  const filtered = useMemo(() => {
    let list = chats;
    if (filterTab !== "all") list = list.filter((c) => c.status === filterTab);
    if (isAdmin && operatorFilter !== "all") {
      const allow = operatorChatsQuery.data;
      if (allow) list = list.filter((c) => allow.has(c.id));
      else list = [];
    }
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
  }, [chats, filterTab, searchTerm, isAdmin, operatorFilter, operatorChatsQuery.data]);

  const selected =
    filtered.find((c) => c.id === selectedId) ?? chats.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[480px] flex-col gap-3 sm:h-[calc(100vh-100px)]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h1 className="truncate text-base font-semibold sm:text-lg">
            {uiCopy("ux.copy33bdcb4f52")}
          </h1>
          <Badge variant="secondary">{chats.length}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && (
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              className="hidden h-8 rounded-md border bg-background px-2 text-xs sm:block"
              title={uiCopy("ux.copy38dcdc6336")}
            >
              <option value="all">{uiCopy("ux.copy48d503e015")}</option>
              {(staffQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? uiCopy("ux.copycee097c09f")}
                </option>
              ))}
            </select>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4 sm:mr-1" />{" "}
              <span className="hidden sm:inline">{uiCopy("ux.copyd21fbc5395")}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[340px_1fr]">
        {/* Left: chat list */}
        <div
          className={cn(
            "min-h-0 flex-col rounded-lg border bg-card",
            selectedId ? "hidden md:flex" : "flex",
          )}
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={uiCopy("ux.copy5599c57f43")}
                className="pl-8 h-9"
              />
            </div>
            <Tabs
              value={filterTab}
              onValueChange={(v) => setFilterTab(v as typeof filterTab)}
              className="mt-2"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="text-xs">
                  {uiCopy("ux.copy934dd25ec5")}{" "}
                  <span className="ml-1 opacity-60">{counts.all}</span>
                </TabsTrigger>
                <TabsTrigger value="new" className="text-xs">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                  {uiCopy("ux.copy884009917a")}
                  {counts.new > 0 && (
                    <span className="ml-1 rounded-full bg-green-500 px-1.5 text-xs font-bold text-white">
                      {counts.new}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="in_progress" className="text-xs">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  {uiCopy("ux.copy9fdd13d4e6")}
                </TabsTrigger>
                <TabsTrigger value="done" className="text-xs">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                  {uiCopy("ux.copy8d8680373c")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <ScrollArea className="flex-1">
            {chatsQuery.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">{uiCopy("ux.copyc21bd66dd4")}</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{uiCopy("ux.copy87efbbfdb9")}</div>
            ) : (
              <div className="divide-y pb-4">
                {filtered.map((c) => {
                  const unreadCount = Math.max(0, Number(c.unread_count) || 0);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "flex w-full min-w-0 items-start gap-2 px-3 py-2.5 text-left transition hover:bg-accent/50",
                        unreadCount > 0 && "bg-green-500/[0.04]",
                        selectedId === c.id && "bg-accent",
                      )}
                    >
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {chatDisplayName(c).charAt(0).toUpperCase()}
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                            STATUS_DOT[c.status],
                          )}
                        />
                        {unreadCount > 0 && (
                          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-xs font-bold leading-none text-white shadow-sm ring-2 ring-card">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm font-medium",
                              unreadCount > 0 && "font-semibold text-foreground",
                            )}
                          >
                            {chatDisplayName(c)}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {unreadCount > 0 && (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-bold leading-none text-white shadow-sm">
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </span>
                            )}
                            {c.last_message_at && (
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(c.last_message_at), {
                                  addSuffix: false,
                                  locale,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5 pr-1">
                          <p
                            className={cn(
                              "min-w-0 flex-1 truncate text-xs",
                              unreadCount > 0
                                ? "font-medium text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {c.last_message_preview ?? "(no preview)"}
                          </p>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn("h-4 gap-0.5 px-1 text-xs", STATUS_BADGE[c.status])}
                          >
                            {STATUS_LABEL[c.status]}
                          </Badge>
                          {c.needs_human && (
                            <Badge
                              variant="outline"
                              title={c.needs_human_reason ?? undefined}
                              className="h-4 gap-0.5 border-red-500/50 bg-red-500/15 px-1 text-xs font-semibold text-red-700 dark:text-red-300"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />{" "}
                              {uiCopy("ux.copy63267b6ea4")}
                            </Badge>
                          )}
                          {c.banned && (
                            <Badge
                              variant="outline"
                              className="h-4 gap-0.5 border-red-600/50 bg-red-600/15 px-1 text-xs font-semibold text-red-700 dark:text-red-300"
                            >
                              {uiCopy("ux.copyb1ff426e0c")}
                            </Badge>
                          )}
                          {c.is_blocked && (
                            <Badge
                              variant="outline"
                              className="h-4 gap-0.5 border-red-500/40 bg-red-500/10 px-1 text-xs text-red-700 dark:text-red-300"
                            >
                              {uiCopy("ux.copy495bd02a6f")}
                            </Badge>
                          )}
                          {replyLockSecondsLeft(c, user?.id, nowMs) > 0 && (
                            <Badge
                              variant="outline"
                              className="h-4 gap-0.5 border-amber-500/40 bg-amber-500/10 px-1 text-xs text-amber-700 dark:text-amber-300"
                            >
                              {uiCopy("ux.copyaa3fa94efd")}
                              {replyLockSecondsLeft(c, user?.id, nowMs)}
                              {uiCopy("ux.copy0445c19584")}
                            </Badge>
                          )}

                          {c.assigned_operator_id && operatorMap[c.assigned_operator_id] ? (
                            <Badge
                              variant="outline"
                              className="h-4 gap-0.5 border-blue-500/30 bg-blue-500/10 px-1 text-xs text-blue-700 dark:text-blue-300"
                            >
                              {uiCopy("ux.copyd8ee08c181")}{" "}
                              {operatorMap[c.assigned_operator_id]?.display_name ??
                                uiCopy("ux.copycee097c09f")}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {uiCopy("ux.copyd1639782f6")}
                            </span>
                          )}
                          {c.telegram_username && (
                            <span className="text-xs text-muted-foreground">
                              @{c.telegram_username}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: conversation */}
        <div
          className={cn(
            "min-h-0 flex-col rounded-lg border bg-card",
            selectedId ? "flex" : "hidden md:flex",
          )}
        >
          {selected ? (
            <>
              <div className="border-b p-2 md:hidden">
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> {uiCopy("ux.copy9a7569f26d")}
                </Button>
              </div>
              <ConversationPane chat={selected} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {uiCopy("ux.copy8fdfaa79a5")}
            </div>
          )}
        </div>
      </div>

      {showSettings && <WebhookSettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function ConversationPane({ chat }: { chat: Chat }) {
  useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [text, setText] = useState("");

  // Operator typing → tell the server to stop AI auto-sending in this chat.
  const pingTypingFn = useServerFn(setTelegramOperatorTyping);
  const dismissSuggestionFn = useServerFn(dismissAiSuggestion);
  const lastTypingPingRef = useRef(0);
  const pingTyping = () => {
    const now = Date.now();
    if (now - lastTypingPingRef.current < 15000) return;
    lastTypingPingRef.current = now;
    void pingTypingFn({ data: { chatRowId: chat.id } }).catch(() => {});
  };

  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showTemplatesManager, setShowTemplatesManager] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingMediaTemplate, setPendingMediaTemplate] = useState<Template | null>(null);
  const [showSmsDialog, setShowSmsDialog] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["telegram-messages", chat.id],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("telegram_messages")
        .select(
          "id, telegram_chat_row_id, direction, text, caption, message_type, media_storage_path, media_file_name, media_mime, media_size, media_width, media_height, media_duration, sent_by, created_at, edited_at, telegram_message_id, reply_to_message_id, is_ai_generated",
        )
        .eq("telegram_chat_row_id", chat.id)
        // Fetch the newest page first. Ordering ascending before LIMIT kept only
        // the oldest 500 rows, so newer bot/AI messages disappeared in long chats.
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as Message[]).reverse();
    },
  });

  // Load profiles for sent_by
  const senderIds = useMemo(
    () =>
      Array.from(
        new Set((messagesQuery.data ?? []).map((m) => m.sent_by).filter((x): x is string => !!x)),
      ),
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

  // Own quick reply templates
  const templatesQuery = useQuery({
    queryKey: ["telegram-templates", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("quick_reply_templates")
        .select(TEMPLATE_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  // 1분 답장 잠금 상태 (다른 담당자가 방금 답장했으면 입력 잠금)
  const [lockNow, setLockNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setLockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const lockSecondsLeft = replyLockSecondsLeft(chat, user?.id, lockNow);

  const sendReply = useServerFn(sendTelegramReply);
  const sendMediaFn = useServerFn(sendTelegramMedia);
  const editMsgFn = useServerFn(editTelegramMessage);
  const unlinkFn = useServerFn(linkTelegramChatToCustomer);
  const setStatusFn = useServerFn(setTelegramChatStatus);

  // NOTE: intentionally do NOT reset unread_count on open — the green "unread" badge only
  // clears when the operator actually replies. Merely viewing a chat leaves the badge intact
  // so the assigned operator can tell that no one has responded yet.

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesQuery.data]);

  const sendMut = useMutation({
    mutationFn: async (msg: string) => {
      return sendReply({
        data: { chatRowId: chat.id, text: msg, replyToMessageId: replyTo?.id ?? null },
      });
    },
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["telegram-messages", chat.id] });
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy7851126014"))),
  });

  const editMut = useMutation({
    mutationFn: async (payload: { messageId: string; text: string }) =>
      editMsgFn({ data: payload }),
    onSuccess: () => {
      setEditingId(null);
      setEditingText("");
      qc.invalidateQueries({ queryKey: ["telegram-messages", chat.id] });
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copydb8be469b3"))),
  });

  const uploadAndSend = async (file: File) => {
    if (!file) return;
    const MAX = 20 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error(localizeError(uiCopy("ux.copy858605d9a8")));
      return;
    }
    setIsUploading(true);
    try {
      const isImage = file.type.startsWith("image/");
      const kind: "photo" | "document" = isImage ? "photo" : "document";
      const safeName = (file.name || `file-${Date.now()}`).replace(/[^\w.\-]+/g, "_");
      const storagePath = `chats/${chat.chat_id}/out-${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("telegram-media")
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;
      await sendMediaFn({
        data: {
          chatRowId: chat.id,
          storagePath,
          fileName: safeName,
          mime: file.type || "application/octet-stream",
          size: file.size,
          kind,
          caption: text.trim() ? text.trim() : null,
          replyToMessageId: replyTo?.id ?? null,
        },
      });
      setText("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["telegram-messages", chat.id] });
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    } catch (e) {
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy1938fe147b")));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const unlinkMut = useMutation({
    mutationFn: async () => unlinkFn({ data: { chatRowId: chat.id, customerId: null } }),
    onSuccess: () => {
      toast.success(uiCopy("ux.copy612c88e20c"));
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    },
  });

  const banFn = useServerFn(setTelegramChatBanned);
  const banMut = useMutation({
    mutationFn: async (banned: boolean) =>
      banFn({ data: { chatRowId: chat.id, banned, reason: banned ? "운영자 차단" : null } }),
    onSuccess: (_d, banned) => {
      toast.success(banned ? uiCopy("ux.copy4be81ba004") : uiCopy("ux.copy1bc5eca1e4"));
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy6b16fe43fd"))),
  });

  const statusMut = useMutation({
    mutationFn: async (status: ChatStatus) => setStatusFn({ data: { chatRowId: chat.id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
      qc.invalidateQueries({ queryKey: ["telegram-messages", chat.id] });
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copydc766aa667"))),
  });

  const onSubmit = () => {
    const t = text.trim();
    if (!t || sendMut.isPending) return;
    sendMut.mutate(t);
  };

  const profileMap = profilesQuery.data ?? {};
  const lockHolderName =
    (chat.reply_lock_by && profileMap[chat.reply_lock_by]?.display_name) ||
    uiCopy("ux.copyde33f64f55");
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messagesQuery.data ?? []) map.set(m.id, m);
    return map;
  }, [messagesQuery.data]);
  const focusInput = () => setTimeout(() => textareaRef.current?.focus(), 0);

  const insertTemplate = (t: Template) => {
    setTemplatesOpen(false);
    if (t.media_type !== "none" && t.media_storage_path) {
      setPendingMediaTemplate(t);
      return;
    }
    setText((prev) => (prev ? `${prev}\n${t.content}` : t.content));
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // ---- Slash autocomplete ----
  const [slashIndex, setSlashIndex] = useState(0);
  const slashQuery = useMemo(() => {
    if (!text.startsWith("/")) return null;
    // Only trigger when the first line begins with "/" and has no whitespace after slash token
    const firstLine = text.split("\n")[0];
    if (!firstLine.startsWith("/")) return null;
    const token = firstLine.slice(1);
    if (/\s/.test(token)) return null;
    return token.toLowerCase();
  }, [text]);

  const slashMatches = useMemo<Template[]>(() => {
    if (slashQuery === null) return [];
    const all = templatesQuery.data ?? [];
    if (slashQuery === "") return all.slice(0, 20);
    const q = slashQuery;
    return all
      .filter((t) => {
        const sc = (t.shortcut ?? "").toLowerCase();
        const ti = (t.title ?? "").toLowerCase();
        return sc.includes(q) || ti.includes(q);
      })
      .slice(0, 20);
  }, [slashQuery, templatesQuery.data]);

  const slashOpen = slashQuery !== null;

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const applySlashTemplate = (t: Template) => {
    // Replace only the first line's "/token" with the template content, keep any subsequent lines.
    const lines = text.split("\n");
    if (t.media_type !== "none" && t.media_storage_path) {
      // For media templates, clear the "/token" from the first line and open the media preview.
      lines[0] = "";
      setText(lines.join("\n").replace(/^\n/, ""));
      setPendingMediaTemplate(t);
      return;
    }
    lines[0] = t.content;
    const next = lines.join("\n");
    setText(next);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = t.content.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-2 border-b px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium">{chatDisplayName(chat)}</span>
            {chat.telegram_username && (
              <span className="text-xs text-muted-foreground">@{chat.telegram_username}</span>
            )}
            <Badge
              variant="outline"
              className={cn("h-5 px-1.5 text-xs", STATUS_BADGE[chat.status])}
            >
              {STATUS_LABEL[chat.status]}
            </Badge>
            {chat.banned && (
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-xs border-red-600/50 bg-red-600/15 text-red-700 dark:text-red-300"
              >
                {uiCopy("ux.copyb1ff426e0c")}
              </Badge>
            )}
            {chat.is_blocked && (
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-xs border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
              >
                {uiCopy("ux.copy495bd02a6f")}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {customerQuery.data ? (
              <span className="text-green-700 dark:text-green-400">
                ✓ {customerQuery.data.name} · {customerQuery.data.phone}
              </span>
            ) : chat.phone ? (
              <span>{chat.phone}</span>
            ) : (
              <span className="text-muted-foreground">{uiCopy("ux.copybdeffc4066")}</span>
            )}
            {(() => {
              const msgs = messagesQuery.data ?? [];
              const lastOut = [...msgs]
                .reverse()
                .find((mm) => mm.direction === "out" && mm.sent_by);
              const name = lastOut?.sent_by ? profileMap[lastOut.sent_by]?.display_name : null;
              if (!name) return null;
              return (
                <span className="text-blue-700 dark:text-blue-300">
                  {uiCopy("ux.copyc56848ce21")} {name}
                </span>
              );
            })()}
          </div>
        </div>
        <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {chat.status !== "done" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => statusMut.mutate("done")}
              disabled={statusMut.isPending}
              className="border-gray-400/40 text-gray-600 hover:bg-gray-500/10 dark:text-gray-300"
            >
              <Check className="mr-1 h-4 w-4" /> {uiCopy("ux.copya9f9a032f1")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => statusMut.mutate("in_progress")}
              disabled={statusMut.isPending}
            >
              {uiCopy("ux.copy2834b5649a")}
            </Button>
          )}
          {chat.customer_id ? (
            <Button size="sm" variant="ghost" onClick={() => unlinkMut.mutate()}>
              <Link2Off className="mr-1 h-4 w-4" /> {uiCopy("ux.copyeb58837ff6")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowLinkDialog(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> {uiCopy("ux.copyd88c6293ee")}
            </Button>
          )}
          {chat.banned ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => banMut.mutate(false)}
              disabled={banMut.isPending}
              className="border-green-500/40 text-green-700 hover:bg-green-500/10 dark:text-green-400"
            >
              <ShieldCheck className="mr-1 h-4 w-4" /> {uiCopy("ux.copyb80f64fc98")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm(uiCopy("ux.copy6166f7d9f7"))) {
                  banMut.mutate(true);
                }
              }}
              disabled={banMut.isPending}
              className="border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-400"
            >
              <Ban className="mr-1 h-4 w-4" /> {uiCopy("ux.copy2d6f7d040f")}
            </Button>
          )}
        </div>
      </div>

      <ParticipationHistory messages={messagesQuery.data ?? []} profileMap={profileMap} />

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {messagesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">{uiCopy("ux.copyc21bd66dd4")}</div>
        ) : (messagesQuery.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">{uiCopy("ux.copye450ca6989")}</div>
        ) : (
          (messagesQuery.data ?? []).map((m) => {
            const isOut = m.direction === "out";
            const sender = m.sent_by ? profileMap[m.sent_by] : null;
            const isMine = isOut && m.sent_by === user?.id;
            const timeLabel = new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const senderLabel = isOut
              ? m.is_ai_generated
                ? uiCopy("ux.copye11da71b5b", { value0: timeLabel })
                : uiCopy("ux.copyc6d0857541", {
                    value0: sender?.display_name ?? uiCopy("ux.copycee097c09f"),
                    value1: isMine ? uiCopy("ux.copy7c87b7cc1a") : "",
                    value2: timeLabel,
                  })
              : uiCopy("ux.copyd1b9a3b288", { value0: timeLabel });
            const isEditing = editingId === m.id;
            const editable =
              isMine &&
              !!m.telegram_message_id &&
              (m.message_type === "text" ||
                m.message_type === "photo" ||
                m.message_type === "document");
            return (
              <div key={m.id} className={cn("group flex", isOut ? "justify-end" : "justify-start")}>
                <div
                  className={cn("max-w-[88%] sm:max-w-[75%]", isOut && "flex flex-col items-end")}
                >
                  <div
                    className={cn(
                      "mb-0.5 flex items-center gap-1.5 text-xs font-medium",
                      isOut ? "justify-end text-primary/80" : "justify-start text-muted-foreground",
                    )}
                  >
                    <span>{senderLabel}</span>
                    {m.edited_at && (
                      <span className="italic opacity-70">{uiCopy("ux.copy8e7ea3f3b8")}</span>
                    )}
                    {!isEditing && !chat.is_blocked && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(m);
                          focusInput();
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition text-primary/70 hover:text-primary"
                        title={uiCopy("ux.copy15ebe9285d")}
                      >
                        <Reply className="h-3 w-3" />
                      </button>
                    )}
                    {editable && !isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditingText(m.text ?? m.caption ?? "");
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition text-primary/70 hover:text-primary"
                        title={uiCopy("ux.copye6b0083ac6")}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                      isOut
                        ? m.is_ai_generated
                          ? "bg-violet-500/15 text-foreground border border-violet-400/40 rounded-br-sm"
                          : "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    {isEditing ? (
                      <div className="flex min-w-0 flex-col gap-2 sm:min-w-[240px]">
                        <Textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={3}
                          className="text-foreground bg-background"
                          autoFocus
                        />
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingId(null);
                              setEditingText("");
                            }}
                            disabled={editMut.isPending}
                          >
                            {uiCopy("ux.copy19b2d19bc1")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              const t = editingText.trim();
                              if (!t) {
                                toast.error(localizeError(uiCopy("ux.copy8f12bb567d")));
                                return;
                              }
                              editMut.mutate({ messageId: m.id, text: t });
                            }}
                            disabled={editMut.isPending}
                          >
                            {editMut.isPending
                              ? uiCopy("ux.copy44bcbeea77")
                              : uiCopy("ux.copy1f1712acff")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.reply_to_message_id && (
                          <QuotedReplyPreview
                            target={messagesById.get(m.reply_to_message_id) ?? null}
                            isOut={isOut}
                            profileMap={profileMap}
                          />
                        )}
                        <MessageBody m={m} onPhotoClick={setPhotoUrl} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {chat.banned ? (
        <div className="border-t bg-red-600/5 p-4">
          <div className="flex items-start gap-2">
            <span className="text-2xl">⛔</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-red-700 dark:text-red-300">
                {uiCopy("ux.copyc1d8859802")}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {uiCopy("ux.copy945211fa95")}
              </div>
            </div>
          </div>
        </div>
      ) : chat.is_blocked ? (
        <div className="border-t p-4 space-y-3 bg-red-500/5">
          <div className="flex items-start gap-2">
            <span className="text-2xl">🚫</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-red-700 dark:text-red-300">
                {uiCopy("ux.copy1a7378ef99")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {uiCopy("ux.copyb17a784415")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowSmsDialog(true)}
              disabled={!(customerQuery.data?.phone || chat.phone)}
              className="flex-1"
            >
              <Send className="mr-2 h-4 w-4" />
              {uiCopy("ux.copy0e0a08f1ea")}
            </Button>
          </div>
          {!(customerQuery.data?.phone || chat.phone) && (
            <div className="text-xs text-muted-foreground">{uiCopy("ux.copy64fe8ca0f0")}</div>
          )}
        </div>
      ) : (
        <div className="border-t p-3 space-y-2">
          {lockSecondsLeft > 0 && (
            <div className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
              🔒 {lockHolderName} {uiCopy("ux.copyb222714d61")}{" "}
              {String(Math.floor(lockSecondsLeft / 60)).padStart(2, "0")}:
              {String(lockSecondsLeft % 60).padStart(2, "0")}
            </div>
          )}
          {replyTo && (
            <div className="flex items-start gap-2 rounded border-l-2 border-primary bg-primary/5 px-2 py-1.5 text-xs">
              <Reply className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-primary">
                  {replyTo.direction === "out"
                    ? uiCopy("ux.copy858d7ba806", {
                        value0:
                          (replyTo.sent_by && profileMap[replyTo.sent_by]?.display_name) ||
                          uiCopy("ux.copycee097c09f"),
                      })
                    : uiCopy("ux.copy28768b393d")}
                </div>
                <div className="line-clamp-2 text-muted-foreground whitespace-pre-wrap break-words">
                  {quotedSnippet(replyTo)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
                title={uiCopy("ux.copy7e9ffb5351")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Zap className="mr-1 h-3.5 w-3.5" />
                  {uiCopy("ux.copy6be533674d")}
                  {templatesQuery.data && templatesQuery.data.length > 0 && (
                    <span className="ml-1 opacity-60">({templatesQuery.data.length})</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-medium">{uiCopy("ux.copybc4b2107e6")}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setTemplatesOpen(false);
                      setShowTemplatesManager(true);
                    }}
                  >
                    <Pencil className="mr-1 h-3 w-3" /> {uiCopy("ux.copyc29fba5a7c")}
                  </Button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {templatesQuery.isLoading ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      {uiCopy("ux.copyc21bd66dd4")}
                    </div>
                  ) : (templatesQuery.data ?? []).length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      {uiCopy("ux.copy0e447a2940")}
                      <br />
                      {uiCopy("ux.copy067ad4588e")}
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {(templatesQuery.data ?? []).map((t) => (
                        <li key={t.id}>
                          <button
                            onClick={() => insertTemplate(t)}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent/50"
                          >
                            <TemplateThumb t={t} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium truncate">{t.title}</span>
                                {t.media_type !== "none" && (
                                  <span className="rounded bg-primary/10 px-1 py-0.5 text-xs text-primary">
                                    {t.media_type === "image" ? "🖼️" : "📎"}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                {t.content}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="relative flex items-end gap-2">
            {slashOpen && (
              <div className="absolute bottom-full left-0 right-14 mb-1 z-20 rounded-md border bg-popover shadow-lg">
                <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                  {uiCopy("ux.copy769e9ced62")} {slashQuery ? `· "/${slashQuery}"` : ""}{" "}
                  {uiCopy("ux.copyd9c9120f66")}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {slashMatches.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      {uiCopy("ux.copy13e7e676ca")}
                    </div>
                  ) : (
                    <ul>
                      {slashMatches.map((t, idx) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applySlashTemplate(t);
                            }}
                            onMouseEnter={() => setSlashIndex(idx)}
                            className={cn(
                              "block w-full px-3 py-2 text-left text-xs",
                              idx === slashIndex ? "bg-accent" : "hover:bg-accent/50",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <TemplateThumb t={t} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  {t.shortcut && (
                                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                                      /{t.shortcut}
                                    </span>
                                  )}
                                  <span className="font-medium">{t.title}</span>
                                  {t.media_type !== "none" && (
                                    <span className="rounded bg-primary/10 px-1 py-0.5 text-xs text-primary">
                                      {t.media_type === "image" ? "🖼️" : "📎"}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                  {t.content}
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {chat.ai_suggestion && (
              <div className="mb-2 rounded-lg border border-violet-500/40 bg-violet-500/10 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                  <Sparkles className="h-3 w-3" /> {uiCopy("ux.copyac628bb42d")}
                  {typeof chat.ai_suggestion_confidence === "number" && (
                    <span className="font-normal opacity-70">
                      {uiCopy("ux.copy1bff70f889")}{" "}
                      {Math.round(chat.ai_suggestion_confidence * 100)}%)
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                  {chat.ai_suggestion}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setText(chat.ai_suggestion ?? "");
                      setTimeout(() => textareaRef.current?.focus(), 0);
                      void dismissSuggestionFn({ data: { chatRowId: chat.id } })
                        .then(() => qc.invalidateQueries({ queryKey: ["telegram-chats"] }))
                        .catch(() => {});
                    }}
                  >
                    {uiCopy("ux.copye81e478217")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      void dismissSuggestionFn({ data: { chatRowId: chat.id } })
                        .then(() => qc.invalidateQueries({ queryKey: ["telegram-chats"] }))
                        .catch(() => {})
                    }
                  >
                    {uiCopy("ux.copy18f7ca9774")}
                  </Button>
                </div>
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim()) pingTyping();
              }}
              onKeyDown={(e) => {
                if (slashOpen && slashMatches.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashIndex((i) => (i + 1) % slashMatches.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    applySlashTemplate(slashMatches[slashIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setText("");
                    return;
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    applySlashTemplate(slashMatches[slashIndex]);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder={
                lockSecondsLeft > 0
                  ? uiCopy("ux.copy02f533eafc", { value0: lockHolderName, value1: lockSecondsLeft })
                  : uiCopy("ux.copy0d96bfc8d0")
              }
              rows={2}
              className="resize-none"
              disabled={sendMut.isPending || lockSecondsLeft > 0}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,video/*,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAndSend(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || sendMut.isPending || lockSecondsLeft > 0}
              title={uiCopy("ux.copy69c33954b8")}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={onSubmit}
              disabled={sendMut.isPending || !text.trim() || isUploading || lockSecondsLeft > 0}
              size="icon"
              className="h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {isUploading && (
            <div className="text-xs text-muted-foreground">{uiCopy("ux.copy1e5a8213b8")}</div>
          )}
        </div>
      )}

      {showLinkDialog && (
        <LinkCustomerDialog chat={chat} onClose={() => setShowLinkDialog(false)} />
      )}
      {showTemplatesManager && (
        <TemplatesManagerDialog onClose={() => setShowTemplatesManager(false)} />
      )}
      {pendingMediaTemplate && (
        <MediaTemplateConfirmDialog
          template={pendingMediaTemplate}
          onClose={() => setPendingMediaTemplate(null)}
          onSend={async (caption: string) => {
            await sendMediaFn({
              data: {
                chatRowId: chat.id,
                storagePath: pendingMediaTemplate.media_storage_path!,
                fileName: pendingMediaTemplate.media_file_name ?? "file",
                mime: pendingMediaTemplate.media_mime ?? "application/octet-stream",
                size: pendingMediaTemplate.media_size ?? 0,
                kind: pendingMediaTemplate.media_type === "image" ? "photo" : "document",
                caption: caption.trim() ? caption.trim() : null,
                replyToMessageId: replyTo?.id ?? null,
              },
            });
            setPendingMediaTemplate(null);
            setReplyTo(null);
            qc.invalidateQueries({ queryKey: ["telegram-messages", chat.id] });
            qc.invalidateQueries({ queryKey: ["telegram-chats"] });
          }}
        />
      )}
      <Dialog open={!!photoUrl} onOpenChange={(o) => !o && setPhotoUrl(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black/95 border-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{uiCopy("ux.copy74842a9af3")}</DialogTitle>
          </DialogHeader>
          <button
            type="button"
            onClick={() => setPhotoUrl(null)}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            aria-label={uiCopy("ux.copy94b7dba159")}
          >
            <X className="h-4 w-4" />
          </button>
          {photoUrl && (
            <img
              src={photoUrl}
              alt={uiCopy("ux.copyeeb35d331b")}
              className="mx-auto max-h-[85vh] w-auto max-w-full rounded"
            />
          )}
          <DialogFooter className="mt-2 sm:justify-center">
            {photoUrl && (
              <a
                href={photoUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="text-xs text-white/80 underline underline-offset-2 hover:text-white"
              >
                {uiCopy("ux.copy64b0dd5f5b")}
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {showSmsDialog && (
        <SendSmsDialog
          chat={chat}
          customerName={customerQuery.data?.name ?? null}
          customerPhone={customerQuery.data?.phone ?? chat.phone ?? ""}
          onClose={() => setShowSmsDialog(false)}
        />
      )}
    </>
  );
}

function ParticipationHistory({
  messages,
  profileMap,
}: {
  messages: Message[];
  profileMap: Record<string, Profile>;
}) {
  useTranslation();
  const runs = useMemo(() => {
    const out: { operatorId: string; start: string; end: string }[] = [];
    for (const m of messages) {
      if (m.direction !== "out" || !m.sent_by) continue;
      const last = out[out.length - 1];
      if (last && last.operatorId === m.sent_by) {
        last.end = m.created_at;
      } else {
        out.push({ operatorId: m.sent_by, start: m.created_at, end: m.created_at });
      }
    }
    return out;
  }, [messages]);

  if (runs.length === 0) return null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-4 py-1.5 text-xs">
      <span className="font-medium text-muted-foreground">{uiCopy("ux.copya16f5a7356")}</span>
      {runs.map((r, i) => (
        <span
          key={i}
          className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-300"
        >
          {profileMap[r.operatorId]?.display_name ?? uiCopy("ux.copycee097c09f")} ({fmt(r.start)}
          {r.start !== r.end ? ` ~ ${fmt(r.end)}` : ""})
        </span>
      ))}
    </div>
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

function TemplateThumb({ t }: { t: Template }) {
  const isImage = t.media_type === "image" && !!t.media_storage_path;
  const q = useSignedMediaUrl(isImage ? t.media_storage_path : null);
  if (t.media_type === "none" || !t.media_storage_path) return null;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted text-sm">
      {isImage && q.data ? (
        <img src={q.data} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span>{t.media_type === "image" ? "🖼️" : "📎"}</span>
      )}
    </div>
  );
}

function MediaTemplateConfirmDialog({
  template,
  onClose,
  onSend,
}: {
  template: Template;
  onClose: () => void;
  onSend: (caption: string) => Promise<void>;
}) {
  useTranslation();
  const [caption, setCaption] = useState(template.content ?? "");
  const [sending, setSending] = useState(false);
  const isImage = template.media_type === "image";
  const q = useSignedMediaUrl(template.media_storage_path);
  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{uiCopy("ux.copyefcca831a2")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded border bg-muted/30 p-2">
            {isImage ? (
              q.data ? (
                <img
                  src={q.data}
                  alt={template.media_file_name ?? ""}
                  className="mx-auto max-h-64 w-auto max-w-full rounded"
                />
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  {uiCopy("ux.copy98a4eaaa8f")}
                </div>
              )
            ) : (
              <div className="flex items-center gap-2 p-2 text-sm">
                📎 <span className="break-all">{template.media_file_name ?? "File"}</span>
                {template.media_size ? (
                  <span className="text-xs opacity-70">({humanSize(template.media_size)})</span>
                ) : null}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{uiCopy("ux.copy98eb584769")}</label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className="resize-none"
              placeholder={uiCopy("ux.copyf98cd93789")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            {uiCopy("ux.copy19b2d19bc1")}
          </Button>
          <Button
            onClick={async () => {
              setSending(true);
              try {
                await onSend(caption);
              } catch (e) {
                toast.error(
                  localizeError(e instanceof Error ? e.message : uiCopy("ux.copy7851126014")),
                );
              } finally {
                setSending(false);
              }
            }}
            disabled={sending}
          >
            {sending ? uiCopy("ux.copyd47f335880") : uiCopy("ux.copy4077ceb9da")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function quotedSnippet(m: Message): string {
  const kind = m.message_type ?? "text";
  if (kind === "photo")
    return uiCopy("ux.copyf234e8c392", { value0: m.caption ? ` · ${m.caption}` : "" });
  if (kind === "document")
    return uiCopy("ux.copy4aed61d8fa", {
      value0: m.media_file_name ?? uiCopy("ux.copy68b8eecb19"),
    });
  if (kind === "video")
    return uiCopy("ux.copy950c54b92c", { value0: m.caption ? ` · ${m.caption}` : "" });
  if (kind === "voice" || kind === "audio") return uiCopy("ux.copy7dac1c49a3");
  if (kind === "sticker") return uiCopy("ux.copyd3a8e31b75");
  if (kind === "contact") return m.text || uiCopy("ux.copyfe90ac7b72");
  return (m.text ?? m.caption ?? "").trim() || uiCopy("ux.copy99c6ef9e6a");
}

function QuotedReplyPreview({
  target,
  isOut,
  profileMap,
}: {
  target: Message | null;
  isOut: boolean;
  profileMap: Record<string, Profile>;
}) {
  useTranslation();
  if (!target) {
    return (
      <div
        className={cn(
          "mb-1.5 rounded border-l-2 px-2 py-1 text-xs opacity-70",
          isOut ? "border-primary-foreground/60 bg-black/10" : "border-primary/50 bg-black/5",
        )}
      >
        {uiCopy("ux.copy6f307b63b6")}
      </div>
    );
  }
  const who =
    target.direction === "out"
      ? (target.sent_by && profileMap[target.sent_by]?.display_name) || uiCopy("ux.copycee097c09f")
      : uiCopy("ux.copya58673ab1d");
  const snippet = quotedSnippet(target);
  return (
    <div
      className={cn(
        "mb-1.5 rounded border-l-2 px-2 py-1 text-xs",
        isOut ? "border-primary-foreground/70 bg-black/10" : "border-primary/50 bg-black/5",
      )}
    >
      <div className="font-semibold opacity-90">{who}</div>
      <div className="line-clamp-2 opacity-80 whitespace-pre-wrap break-words">{snippet}</div>
    </div>
  );
}

function MessageBody({ m, onPhotoClick }: { m: Message; onPhotoClick?: (url: string) => void }) {
  useTranslation();
  const kind = m.message_type ?? "text";
  const mediaQ = useSignedMediaUrl(m.media_storage_path);
  const url = mediaQ.data;
  const caption = m.caption ?? null;

  if (kind === "contact") {
    const label = m.text && m.text.trim() ? m.text : uiCopy("ux.copyfe90ac7b72");
    return <span className="font-medium">{label}</span>;
  }

  if (kind === "text" || (!m.media_storage_path && m.text)) {
    return <>{m.text ?? m.caption ?? uiCopy("ux.copy37820bf881")}</>;
  }

  const captionEl = caption ? (
    <div className="mt-1.5 whitespace-pre-wrap break-words">{caption}</div>
  ) : null;

  if (kind === "photo" || kind === "sticker") {
    return (
      <div>
        {url ? (
          <button
            type="button"
            onClick={() => onPhotoClick?.(url)}
            className="block cursor-zoom-in"
            title={uiCopy("ux.copyb98c80ee2b")}
          >
            <img
              src={url}
              alt={caption ?? "photo"}
              className="max-h-80 max-w-full rounded-lg object-contain"
              loading="lazy"
            />
          </button>
        ) : (
          <div className="opacity-70">{uiCopy("ux.copy4b893226b3")}</div>
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
          <div className="opacity-70">{uiCopy("ux.copya9d364055b")}</div>
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
          <div className="opacity-70">{uiCopy("ux.copy7b80019725")}</div>
        )}
        {captionEl}
      </div>
    );
  }

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
        {m.media_size ? (
          <span className="opacity-70 text-xs">({humanSize(m.media_size)})</span>
        ) : null}
      </a>
      {captionEl}
    </div>
  );
}

function TemplatesManagerDialog({ onClose }: { onClose: () => void }) {
  useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [mediaType, setMediaType] = useState<TemplateMediaType>("none");
  const [mediaStoragePath, setMediaStoragePath] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [mediaSize, setMediaSize] = useState<number | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const previewUrlQ = useSignedMediaUrl(mediaType === "image" ? mediaStoragePath : null);

  const templatesQuery = useQuery({
    queryKey: ["telegram-templates", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("quick_reply_templates")
        .select(TEMPLATE_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setShortcut("");
    setMediaType("none");
    setMediaStoragePath(null);
    setMediaFileName(null);
    setMediaMime(null);
    setMediaSize(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error(uiCopy("ux.copy26f5e5fa97"));
      const t = title.trim();
      const c = content.trim();
      const sRaw = shortcut.trim().toLowerCase().replace(/^\/+/, "");
      if (/\s/.test(sRaw)) throw new Error(uiCopy("ux.copy972573befa"));
      const s = sRaw || null;
      if (!t) throw new Error(uiCopy("ux.copye84a95fdf9"));
      if (mediaType === "none" && !c) throw new Error(uiCopy("ux.copyf3c8d82aab"));
      const payload = {
        title: t,
        content: c,
        shortcut: s,
        media_type: mediaType,
        media_storage_path: mediaStoragePath,
        media_file_name: mediaFileName,
        media_mime: mediaMime,
        media_size: mediaSize,
      };
      if (editing) {
        const { error } = await supabase
          .from("quick_reply_templates")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quick_reply_templates")
          .insert({ operator_id: user.id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? uiCopy("ux.copy6b7dad83b5") : uiCopy("ux.copy75c960b438"));
      resetForm();
      qc.invalidateQueries({ queryKey: ["telegram-templates", user?.id] });
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy732fe33ab1"))),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_reply_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiCopy("ux.copy5ab2ec72b3"));
      qc.invalidateQueries({ queryKey: ["telegram-templates", user?.id] });
      resetForm();
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy732fe33ab1"))),
  });

  const startEdit = (t: Template) => {
    setEditing(t);
    setTitle(t.title);
    setContent(t.content);
    setShortcut(t.shortcut ?? "");
    setMediaType(t.media_type);
    setMediaStoragePath(t.media_storage_path);
    setMediaFileName(t.media_file_name);
    setMediaMime(t.media_mime);
    setMediaSize(t.media_size);
  };

  const onUploadMedia = async (file: File) => {
    if (!user?.id) return;
    setUploadingMedia(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `templates/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("telegram-media").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw error;
      setMediaStoragePath(path);
      setMediaFileName(file.name);
      setMediaMime(file.type || "application/octet-stream");
      setMediaSize(file.size);
      setMediaType(file.type.startsWith("image/") ? "image" : "document");
    } catch (e) {
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copya40a00757b")));
    } finally {
      setUploadingMedia(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{uiCopy("ux.copy3ab300078c")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="min-h-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {uiCopy("ux.copy2861047333")}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>
                <Plus className="mr-1 h-3 w-3" /> {uiCopy("ux.copyeb1dda51dd")}
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded border">
              {templatesQuery.isLoading ? (
                <div className="p-3 text-xs text-muted-foreground">
                  {uiCopy("ux.copyc21bd66dd4")}
                </div>
              ) : (templatesQuery.data ?? []).length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {uiCopy("ux.copy0e447a2940")}
                </div>
              ) : (
                <ul className="divide-y">
                  {(templatesQuery.data ?? []).map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "flex items-start justify-between gap-2 p-2",
                        editing?.id === t.id && "bg-accent/60",
                      )}
                    >
                      <button onClick={() => startEdit(t)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          {t.shortcut && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                              /{t.shortcut}
                            </span>
                          )}
                          <span className="text-xs font-medium">{t.title}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          {t.content}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => startEdit(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(uiCopy("ux.copy0663e3146a", { value0: t.title })))
                              deleteMut.mutate(t.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {editing ? uiCopy("ux.copy326aa3c366") : uiCopy("ux.copyeb1dda51dd")}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">
                  {uiCopy("ux.copye78e385761")}
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={uiCopy("ux.copy4e0e306b29")}
                  maxLength={80}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {uiCopy("ux.copy07afefd25e")}
                </label>
                <Input
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ""))}
                  placeholder="salom"
                  maxLength={32}
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  {uiCopy("ux.copya5533e6f4e")}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {uiCopy("ux.copy3d9477b42c")}
                </label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={uiCopy("ux.copy0c0ca4146c")}
                  rows={7}
                  className="resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {uiCopy("ux.copydd37a7dd41")}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadMedia(f);
                      e.target.value = "";
                    }}
                    disabled={uploadingMedia}
                  />
                  {mediaStoragePath && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMediaType("none");
                        setMediaStoragePath(null);
                        setMediaFileName(null);
                        setMediaMime(null);
                        setMediaSize(null);
                      }}
                    >
                      {uiCopy("ux.copy11f2aa43b2")}
                    </Button>
                  )}
                </div>
                {uploadingMedia && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {uiCopy("ux.copy1e5a8213b8")}
                  </div>
                )}
                {mediaStoragePath && (
                  <div className="mt-2 flex items-center gap-2 rounded border bg-muted/30 p-2">
                    {mediaType === "image" && previewUrlQ.data ? (
                      <img
                        src={previewUrlQ.data}
                        alt=""
                        className="h-16 w-16 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded bg-muted text-2xl">
                        📎
                      </div>
                    )}
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="truncate">{mediaFileName}</div>
                      <div className="text-muted-foreground">{humanSize(mediaSize)}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                {editing && (
                  <Button variant="ghost" size="sm" onClick={resetForm}>
                    {uiCopy("ux.copy19b2d19bc1")}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => saveMut.mutate()}
                  disabled={
                    saveMut.isPending || !title.trim() || (mediaType === "none" && !content.trim())
                  }
                >
                  {editing ? uiCopy("ux.copye1407b5115") : uiCopy("ux.copy5794299536")}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {uiCopy("ux.copy94b7dba159")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkCustomerDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState(chat.phone ?? "");
  const searchFn = useServerFn(searchCustomersForTelegram);
  const linkFn = useServerFn(linkTelegramChatToCustomer);

  const searchMut = useMutation({
    mutationFn: async (query: string) => searchFn({ data: { query } }),
  });

  const linkMut = useMutation({
    mutationFn: async (customerId: string) => linkFn({ data: { chatRowId: chat.id, customerId } }),
    onSuccess: () => {
      toast.success(uiCopy("ux.copy007b3cbe11"));
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
      onClose();
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy732fe33ab1"))),
  });

  useEffect(() => {
    if (q.trim().length >= 2) searchMut.mutate(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{uiCopy("ux.copyd88c6293ee")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={uiCopy("ux.copy4bc1e83559")}
              onKeyDown={(e) => e.key === "Enter" && searchMut.mutate(q)}
            />
            <Button onClick={() => searchMut.mutate(q)} disabled={searchMut.isPending}>
              {uiCopy("ux.copy4f5a3f69b7")}
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
                {searchMut.isPending ? uiCopy("ux.copy4b58c50289") : uiCopy("ux.copyc342b44870")}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {uiCopy("ux.copy19b2d19bc1")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendSmsDialog({
  chat,
  customerName,
  customerPhone,
  onClose,
}: {
  chat: Chat;
  customerName: string | null;
  customerPhone: string;
  onClose: () => void;
}) {
  useTranslation();
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState(customerPhone ?? "");
  const sendSms = useSendSms();
  const markRead = useServerFn(markTelegramChatRead);
  const qc = useQueryClient();

  const normalizedPhone = phone.replace(/[^\d]/g, "");
  const isValidKrPhone = /^01[0-9]{8,9}$/.test(normalizedPhone);

  const handleSend = async () => {
    const msg = message.trim();
    if (!msg) {
      toast.error(localizeError(uiCopy("ux.copy591df23695")));
      return;
    }
    if (!isValidKrPhone) {
      toast.error(localizeError(uiCopy("ux.copyf405af215e")));
      return;
    }
    try {
      const res = await sendSms.mutateAsync({
        receivers: [
          {
            customer_id: chat.customer_id ?? null,
            name: customerName ?? chat.first_name ?? null,
            phone: normalizedPhone,
          },
        ],
        message: msg,
        title: title.trim() || undefined,
      });
      if (res?.ok === false) {
        toast.error(localizeError(res?.aligo?.message || uiCopy("ux.copy0efbf5e456")));
        return;
      }
      // Mark chat as read even though we replied via SMS (Telegram delivery is blocked)
      try {
        await markRead({ data: { chatRowId: chat.id } });
        qc.invalidateQueries({ queryKey: ["telegram-chats"] });
      } catch {
        // non-fatal
      }
      toast.success(uiCopy("ux.copyd7b6a39358"));
      onClose();
    } catch (e) {
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy0efbf5e456")));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{uiCopy("ux.copy769bcd3793")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {uiCopy("ux.copybcea1ddb69")}{" "}
            <span className="font-medium text-foreground">
              {customerName ?? chat.first_name ?? uiCopy("ux.copya58673ab1d")}
            </span>
            {customerPhone && (
              <span className="ml-1">
                {uiCopy("ux.copy42730f04b4")} <span className="font-mono">{customerPhone}</span>
              </span>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              {uiCopy("ux.copyc561f13f8f")}
            </label>
            <Input
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className={!phone || isValidKrPhone ? "" : "border-destructive"}
            />
            {phone && !isValidKrPhone && (
              <div className="text-xs text-destructive">{uiCopy("ux.copy7fb40b86b9")}</div>
            )}
            {customerPhone &&
              phone.replace(/[^\d]/g, "") !== customerPhone.replace(/[^\d]/g, "") && (
                <button
                  type="button"
                  onClick={() => setPhone(customerPhone)}
                  className="text-xs text-primary hover:underline"
                >
                  {uiCopy("ux.copydf0984747f")}
                </button>
              )}
          </div>
          <Input
            placeholder={uiCopy("ux.copy5aa63d2b3a")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={44}
          />
          <Textarea
            placeholder={uiCopy("ux.copya29053f55a")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
          />
          <div className="text-xs text-muted-foreground">{uiCopy("ux.copy637f851561")}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sendSms.isPending}>
            {uiCopy("ux.copy19b2d19bc1")}
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendSms.isPending || !message.trim() || !isValidKrPhone}
          >
            <Send className="mr-2 h-4 w-4" />
            {sendSms.isPending ? uiCopy("ux.copydef390ab23") : uiCopy("ux.copy0e0a08f1ea")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhookSettingsDialog({ onClose }: { onClose: () => void }) {
  useTranslation();
  const defaultUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/public/telegram/webhook` : "";
  const [url, setUrl] = useState(defaultUrl);
  const registerFn = useServerFn(registerTelegramWebhook);
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: async () => registerFn({ data: { webhookUrl: url } }),
    onSuccess: (data) => {
      setResult(data);
      toast.success(uiCopy("ux.copy01fe455170", { value0: (data as any).bot?.username }));
    },
    onError: (e) =>
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copy732fe33ab1"))),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{uiCopy("ux.copy5154aef071")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{uiCopy("ux.copyc8f721271f")}</p>
          <div>
            <label className="text-xs font-medium">{uiCopy("ux.copyfa7517b6b6")}</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">{uiCopy("ux.copyb28408b312")}</p>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !url} className="w-full">
            {mut.isPending ? uiCopy("ux.copy9ace4cd899") : uiCopy("ux.copy08151dbbb3")}
          </Button>
          {result && (
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {uiCopy("ux.copy94b7dba159")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
