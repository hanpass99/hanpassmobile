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
  Zap,
  Plus,
  Pencil,
  Trash2,
  Check,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  sendTelegramReply,
  markTelegramChatRead,
  linkTelegramChatToCustomer,
  searchCustomersForTelegram,
  registerTelegramWebhook,
  setTelegramChatStatus,
} from "@/lib/telegram.functions";

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

type Template = { id: string; title: string; content: string; shortcut: string | null };

const STATUS_LABEL: Record<ChatStatus, string> = {
  new: "신규",
  in_progress: "처리중",
  done: "완료",
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
  const [filterTab, setFilterTab] = useState<"all" | ChatStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
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

  // Load display names for all assigned operators referenced by any chat
  const operatorIds = useMemo(
    () => Array.from(new Set(chats.map((c) => c.assigned_operator_id).filter((x): x is string => !!x))),
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


  const selected = filtered.find((c) => c.id === selectedId) ?? chats.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h1 className="text-lg font-semibold">텔레그램 상담 · Telegram Chat</h1>
          <Badge variant="secondary">{chats.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              title="상담사별 대화 필터 (감사용)"
            >
              <option value="all">전체 상담사</option>
              {(staffQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? "직원"}
                </option>
              ))}
            </select>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="mr-1 h-4 w-4" /> 웹훅 설정
            </Button>
          )}
        </div>
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
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="text-xs">
                  전체 <span className="ml-1 opacity-60">{counts.all}</span>
                </TabsTrigger>
                <TabsTrigger value="new" className="text-xs">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                  신규
                  {counts.new > 0 && (
                    <span className="ml-1 rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">
                      {counts.new}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="in_progress" className="text-xs">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  처리중
                </TabsTrigger>
                <TabsTrigger value="done" className="text-xs">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                  완료
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
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {chatDisplayName(c).charAt(0).toUpperCase()}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                          STATUS_DOT[c.status],
                        )}
                      />
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
                          <span className="rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                        <Badge variant="outline" className={cn("h-4 gap-0.5 px-1 text-[9px]", STATUS_BADGE[c.status])}>
                          {STATUS_LABEL[c.status]}
                        </Badge>
                        {c.assigned_operator_id && operatorMap[c.assigned_operator_id] ? (
                          <Badge
                            variant="outline"
                            className="h-4 gap-0.5 border-blue-500/30 bg-blue-500/10 px-1 text-[9px] text-blue-700 dark:text-blue-300"
                          >
                            담당: {operatorMap[c.assigned_operator_id]?.display_name ?? "직원"}
                          </Badge>
                        ) : (
                          <span className="text-[9px] text-muted-foreground">담당: 없음</span>
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
  const [showTemplatesManager, setShowTemplatesManager] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Own quick reply templates
  const templatesQuery = useQuery({
    queryKey: ["telegram-templates", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("quick_reply_templates")
        .select("id, title, content, shortcut")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const markRead = useServerFn(markTelegramChatRead);
  const sendReply = useServerFn(sendTelegramReply);
  const unlinkFn = useServerFn(linkTelegramChatToCustomer);
  const setStatusFn = useServerFn(setTelegramChatStatus);

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

  const statusMut = useMutation({
    mutationFn: async (status: ChatStatus) => setStatusFn({ data: { chatRowId: chat.id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram-chats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "상태 변경 실패"),
  });

  const onSubmit = () => {
    const t = text.trim();
    if (!t || sendMut.isPending) return;
    sendMut.mutate(t);
  };

  const profileMap = profilesQuery.data ?? {};

  const insertTemplate = (t: Template) => {
    setText((prev) => (prev ? `${prev}\n${t.content}` : t.content));
    setTemplatesOpen(false);
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
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{chatDisplayName(chat)}</span>
            {chat.telegram_username && (
              <span className="text-xs text-muted-foreground">@{chat.telegram_username}</span>
            )}
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", STATUS_BADGE[chat.status])}>
              {STATUS_LABEL[chat.status]}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {customerQuery.data ? (
              <span className="text-green-700 dark:text-green-400">
                ✓ {customerQuery.data.name} · {customerQuery.data.phone}
              </span>
            ) : chat.phone ? (
              <span>{chat.phone}</span>
            ) : (
              <span className="text-muted-foreground">번호 대기중</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {chat.status !== "done" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => statusMut.mutate("done")}
              disabled={statusMut.isPending}
              className="border-gray-400/40 text-gray-600 hover:bg-gray-500/10 dark:text-gray-300"
            >
              <Check className="mr-1 h-4 w-4" /> 완료 처리
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => statusMut.mutate("in_progress")}
              disabled={statusMut.isPending}
            >
              다시 열기
            </Button>
          )}
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

      <ParticipationHistory messages={messagesQuery.data ?? []} profileMap={profileMap} />


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
            const timeLabel = new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const senderLabel = isOut
              ? `${sender?.display_name ?? "직원"}${isMine ? " (나)" : ""} · ${timeLabel}`
              : `고객 · ${timeLabel}`;
            return (
              <div key={m.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%]", isOut && "flex flex-col items-end")}>
                  <div
                    className={cn(
                      "mb-0.5 text-[10px] font-medium",
                      isOut ? "text-right text-primary/80" : "text-left text-muted-foreground",
                    )}
                  >
                    {senderLabel}
                  </div>
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
                </div>
              </div>
            );

          })
        )}
      </div>

      <div className="border-t p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Zap className="mr-1 h-3.5 w-3.5" />
                템플릿
                {templatesQuery.data && templatesQuery.data.length > 0 && (
                  <span className="ml-1 opacity-60">({templatesQuery.data.length})</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-medium">내 빠른 답변</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setTemplatesOpen(false);
                    setShowTemplatesManager(true);
                  }}
                >
                  <Pencil className="mr-1 h-3 w-3" /> 관리
                </Button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {templatesQuery.isLoading ? (
                  <div className="p-3 text-xs text-muted-foreground">불러오는 중...</div>
                ) : (templatesQuery.data ?? []).length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    아직 템플릿이 없습니다.
                    <br />
                    "관리"에서 만들어 보세요.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {(templatesQuery.data ?? []).map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => insertTemplate(t)}
                          className="block w-full px-3 py-2 text-left hover:bg-accent/50"
                        >
                          <div className="text-xs font-medium">{t.title}</div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
                            {t.content}
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
              <div className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
                템플릿 자동완성 {slashQuery ? `· "/${slashQuery}"` : ""} — ↑/↓ 이동, Enter 삽입, Esc 취소
              </div>
              <div className="max-h-64 overflow-y-auto">
                {slashMatches.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">템플릿 없음</div>
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
                          <div className="flex items-center gap-2">
                            {t.shortcut && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                                /{t.shortcut}
                              </span>
                            )}
                            <span className="font-medium">{t.title}</span>
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
                            {t.content}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
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
            placeholder="메시지 입력 (Enter 전송, Shift+Enter 줄바꿈, / 로 템플릿 검색)"
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
      {showTemplatesManager && (
        <TemplatesManagerDialog onClose={() => setShowTemplatesManager(false)} />
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
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-4 py-1.5 text-[11px]">
      <span className="font-medium text-muted-foreground">응대 이력:</span>
      {runs.map((r, i) => (
        <span
          key={i}
          className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-300"
        >
          {profileMap[r.operatorId]?.display_name ?? "직원"} ({fmt(r.start)}
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

function MessageBody({ m }: { m: Message }) {
  const kind = m.message_type ?? "text";
  const mediaQ = useSignedMediaUrl(m.media_storage_path);
  const url = mediaQ.data;
  const caption = m.caption ?? null;

  if (kind === "contact") {
    // Try to extract phone from raw first, fall back to persisted text summary.
    const raw = (m as unknown as { raw?: { contact?: { phone_number?: string; first_name?: string; last_name?: string } } }).raw;
    const c = raw?.contact;
    const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() : "";
    const phone = c?.phone_number ?? "";
    const label = name || phone
      ? `📱 연락처: ${name}${name && phone ? " · " : ""}${phone}`
      : (m.text ?? "📱 연락처");
    return <span className="font-medium">{label}</span>;
  }

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


function TemplatesManagerDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [shortcut, setShortcut] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["telegram-templates", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("quick_reply_templates")
        .select("id, title, content, shortcut")
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
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("로그인이 필요합니다");
      const t = title.trim();
      const c = content.trim();
      const sRaw = shortcut.trim().toLowerCase().replace(/^\/+/, "");
      if (/\s/.test(sRaw)) throw new Error("단축어에 공백을 사용할 수 없습니다");
      const s = sRaw || null;
      if (!t || !c) throw new Error("제목과 내용을 입력하세요");
      if (editing) {
        const { error } = await supabase
          .from("quick_reply_templates")
          .update({ title: t, content: c, shortcut: s })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quick_reply_templates")
          .insert({ operator_id: user.id, title: t, content: c, shortcut: s });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "수정됨" : "추가됨");
      resetForm();
      qc.invalidateQueries({ queryKey: ["telegram-templates", user?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실패"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_reply_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("삭제됨");
      qc.invalidateQueries({ queryKey: ["telegram-templates", user?.id] });
      resetForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실패"),
  });

  const startEdit = (t: Template) => {
    setEditing(t);
    setTitle(t.title);
    setContent(t.content);
    setShortcut(t.shortcut ?? "");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>내 빠른 답변 템플릿</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="min-h-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">내 템플릿</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>
                <Plus className="mr-1 h-3 w-3" /> 새 템플릿
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded border">
              {templatesQuery.isLoading ? (
                <div className="p-3 text-xs text-muted-foreground">불러오는 중...</div>
              ) : (templatesQuery.data ?? []).length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  아직 템플릿이 없습니다.
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
                      <button
                        onClick={() => startEdit(t)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          {t.shortcut && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                              /{t.shortcut}
                            </span>
                          )}
                          <span className="text-xs font-medium">{t.title}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
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
                            if (confirm(`"${t.title}" 삭제하시겠습니까?`)) deleteMut.mutate(t.id);
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
              {editing ? "템플릿 수정" : "새 템플릿"}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-muted-foreground">제목 (짧은 이름)</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 인사말"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  단축어 (선택, 공백 없이 짧은 단어 — 예: salom, tarif)
                </label>
                <Input
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ""))}
                  placeholder="salom"
                  maxLength={32}
                />
                <div className="mt-1 text-[10px] text-muted-foreground">
                  입력창에 "/" 를 치면 자동완성 목록이 나타납니다.
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">내용 (실제 전송될 메시지)</label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="어떤 언어든 자유롭게 입력하세요 (한국어 / O'zbek / Русский …)"
                  rows={7}
                  className="resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                {editing && (
                  <Button variant="ghost" size="sm" onClick={resetForm}>
                    취소
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || !title.trim() || !content.trim()}
                >
                  {editing ? "수정" : "추가"}
                </Button>
              </div>
            </div>
          </div>
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
