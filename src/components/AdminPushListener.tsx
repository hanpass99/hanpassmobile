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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="animate-pulse-border relative w-full max-w-4xl overflow-hidden rounded-3xl border-[6px] border-destructive bg-background shadow-[0_0_60px_rgba(var(--destructive),0.45)]">
        <div className="flex items-center gap-4 bg-destructive px-8 py-5 text-destructive-foreground">
          <div className="relative">
            <Bell className="h-10 w-10 animate-pulse" />
          </div>
          <div className="flex flex-1 items-center gap-3">
            <AlertTriangle className="h-8 w-8" />
            <span className="text-3xl font-black tracking-wide">긴급 공지 · URGENT NOTICE</span>
          </div>
          {queue.length > 1 ? (
            <span className="rounded-full bg-destructive-foreground/20 px-5 py-2 text-lg font-bold">
              +{queue.length - 1}
            </span>
          ) : null}
        </div>

        <div className="px-10 py-8">
          <h2 className="mb-2 text-4xl font-black leading-tight text-foreground">
            {current.title?.trim() ? current.title : "관리자 공지 / Admin Notice"}
          </h2>
          <p className="mb-6 text-base text-muted-foreground">
            {current.sender_name ? `${current.sender_name}` : ""}
            {current.created_at
              ? `${current.sender_name ? " · " : ""}${new Date(current.created_at).toLocaleString()}`
              : ""}
          </p>

          <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border-2 border-border bg-muted/40 p-6 text-2xl font-medium leading-relaxed text-foreground">
            {current.message}
          </div>
        </div>

        <div className="border-t border-border bg-muted/30 p-6">
          <Button
            size="lg"
            variant="destructive"
            className="h-20 w-full text-2xl font-black shadow-xl"
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
