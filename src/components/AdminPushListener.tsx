import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

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
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-2xl border-4 border-destructive bg-background p-0 shadow-2xl shadow-destructive/30 [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="bg-destructive px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-destructive-foreground/20 text-destructive-foreground">
              <Bell className="h-8 w-8 animate-pulse" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-destructive-foreground">
                {current.title?.trim() ? current.title : "긴급 관리자 공지"}
              </DialogTitle>
              <p className="mt-1 text-sm text-destructive-foreground/90">
                {current.sender_name ? `보낸 사람: ${current.sender_name}` : ""}
                {current.created_at ? ` · ${new Date(current.created_at).toLocaleString()}` : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-4 pt-2">
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-lg font-medium leading-relaxed text-foreground">
            {current.message}
          </div>
          {queue.length > 1 ? (
            <p className="mt-3 text-sm font-semibold text-destructive">
              확인 대기 중인 공지 {queue.length}건
            </p>
          ) : null}
          <DialogFooter className="mt-5">
            <Button
              size="lg"
              variant="destructive"
              className="w-full text-lg font-bold"
              onClick={ack}
              disabled={acking}
            >
              {acking ? "처리 중..." : "확인 (필수)"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
