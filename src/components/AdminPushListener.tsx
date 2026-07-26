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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="animate-pulse-border relative w-full max-w-xl overflow-hidden rounded-2xl border-4 border-destructive bg-background shadow-2xl">
        <div className="flex items-center gap-3 bg-destructive px-5 py-3 text-destructive-foreground">
          <div className="relative">
            <Bell className="h-6 w-6 animate-pulse" />
          </div>
          <div className="flex flex-1 items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-lg font-black tracking-wide">긴급 공지 · URGENT NOTICE</span>
          </div>
          {queue.length > 1 ? (
            <span className="rounded-full bg-destructive-foreground/20 px-3 py-1 text-sm font-bold">
              +{queue.length - 1}
            </span>
          ) : null}
        </div>

        <div className="px-6 py-5">
          <h2 className="mb-1 text-2xl font-black leading-tight text-foreground">
            {current.title?.trim() ? current.title : "관리자 공지 / Admin Notice"}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {current.sender_name ? `${current.sender_name}` : ""}
            {current.created_at
              ? `${current.sender_name ? " · " : ""}${new Date(current.created_at).toLocaleString()}`
              : ""}
          </p>

          <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-base font-medium leading-relaxed text-foreground">
            {current.message}
          </div>
        </div>

        <div className="border-t border-border bg-muted/30 p-4">
          <Button
            size="lg"
            variant="destructive"
            className="h-14 w-full text-lg font-bold shadow-lg"
            onClick={ack}
            disabled={acking}
          >
            {acking ? "처리 중..." : "확인 / Acknowledge"}
          </Button>
        </div>
      </div>
    </div>
  );
}
