import i18n from "@/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, UserCheck, Clock, Camera, Trash2 } from "lucide-react";
import { resizeImage } from "@/lib/image-resize";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: i18n.t("head.settings") }] }),
  component: Settings,
});

function Settings() {
  const { t } = useTranslation();
  const { isAdmin, user } = useAuth();

  return (
    <div className="space-y-5">
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />

      {/* 내 계정 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.myAccount")}</CardTitle>
          <CardDescription>{t("settings.myAccountDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProfilePhotoSection />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {t("settings.emailId")}
              </div>
              <div className="mt-1 truncate text-sm font-semibold">{user?.email ?? "-"}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" /> {t("settings.permission")}
              </div>
              <div className="mt-1 text-sm font-semibold">{isAdmin ? t("common.admin") : t("common.staff")}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {t("settings.lastLogin")}
              </div>
              <div className="mt-1 text-sm font-semibold">
                {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfilePhotoSection() {
  const { t } = useTranslation();
  const { user, displayName, avatarUrl, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = (displayName || user?.email || "U").trim().charAt(0).toUpperCase();

  const onPick = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error(t("settings.photoSizeLimit"));
    setBusy(true);
    try {
      const blob = await resizeImage(file, 512, 0.85);
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg", upsert: true,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: upErr } = await supabase.from("profiles")
        .update({ avatar_url: pub.publicUrl }).eq("id", user.id);
      if (upErr) throw upErr;
      toast.success(t("settings.photoUpdated"));
      await refresh();
    } catch (e: any) {
      toast.error(t("settings.photoFailed", { msg: e.message }));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    await refresh();
    setBusy(false);
  };

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border/60 p-3 sm:gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-bold text-primary">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{displayName || user?.email}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            {busy ? t("settings.uploading") : t("settings.uploadPhoto")}
          </Button>
          {avatarUrl && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("settings.removePhoto")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
