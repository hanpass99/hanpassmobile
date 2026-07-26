import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle } from "lucide-react";

type PendingNoti = {
  recipient_id: string;
  notification_id: string;
  title: string | null;
  message: string;
  created_at: string;
  sender_name: string | null;
};

export function AdminPushListener() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<PendingNoti[]>([]);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("admin_notification_recipients")
      .select("id, notification_id, admin_notifications!inner(id, title, message, created_at, sender_id)")
      .eq("user_id", user.id)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: true });
    if (error || !data) return;
    const senderIds = Array.from(new Set(data.map((r: any) => r.admin_notifications?.sender_id).filter(Boolean)));
    let senderMap = new Map<string, string>();
    if (senderIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", senderIds);
      senderMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    }
    setQueue(
      data.map((r: any) => ({
        recipient_id: r.id,
        notification_id: r.notification_id,
        title: r.admin_notifications?.title ?? null,
        message: r.admin_notifications?.message ?? "",
        created_at: r.admin_notifications?.created_at ?? "",
        sender_name: senderMap.get(r.admin_notifications?.sender_id) ?? null,
      })),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel(`admin-push-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notification_recipients", filter: `user_id=eq.${user.id}` },
        () => {
          load();
          try {
            if (typeof window !== "undefined" && "Audio" in window) {
              const a = new Audio(
                "data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTgAAAB/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/",
              );
              a.play().catch(() => {});
            }
          } catch {}
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const current = queue[0];
  const ack = async () => {
    if (!current) return;
    setAcking(true);
    const { error } = await supabase
      .from("admin_notification_recipients")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", current.recipient_id);
    setAcking(false);
    if (!error) setQueue((q) => q.slice(1));
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-destructive">
      <div className="animate-pulse-border absolute inset-0 pointer-events-none border-[16px] border-destructive-foreground/40" />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 animate-ping rounded-full bg-destructive-foreground/30 blur-xl" />
          <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-destructive-foreground/20 text-destructive-foreground shadow-2xl">
            <Bell className="h-20 w-20 animate-pulse" />
          </div>
        </div>

        <div className="mb-4 flex items-center justify-center gap-3 rounded-full bg-destructive-foreground/20 px-6 py-2 text-destructive-foreground">
          <AlertTriangle className="h-7 w-7" />
          <span className="text-2xl font-black tracking-wider">긴급 공지</span>
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h1 className="mb-4 max-w-5xl text-5xl font-black leading-tight text-destructive-foreground md:text-7xl">
          {current.title?.trim() ? current.title : "긴급 관리자 공지"}
        </h1>

        <p className="mb-10 text-xl font-bold text-destructive-foreground/90">
          {current.sender_name ? `보낸 사람: ${current.sender_name}` : ""}
          {current.created_at ? `${current.sender_name ? " · " : ""}${new Date(current.created_at).toLocaleString()}` : ""}
        </p>

        <div className="max-h-[40vh] w-full max-w-5xl overflow-y-auto whitespace-pre-wrap rounded-2xl border-4 border-destructive-foreground/30 bg-background p-8 text-left text-3xl font-bold leading-relaxed text-foreground shadow-2xl md:text-4xl">
          {current.message}
        </div>

        {queue.length > 1 ? (
          <p className="mt-6 text-xl font-black text-destructive-foreground">
            확인 대기 중인 공지 {queue.length}건
          </p>
        ) : null}
      </div>

      <div className="w-full border-t-4 border-destructive-foreground/30 bg-background p-6 md:p-8">
        <div className="mx-auto w-full max-w-5xl">
          <Button
            size="lg"
            variant="destructive"
            className="h-24 w-full animate-pulse text-3xl font-black shadow-2xl md:h-28 md:text-4xl"
            onClick={ack}
            disabled={acking}
          >
            {acking ? "처리 중..." : "확인 (필수)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
