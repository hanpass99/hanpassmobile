import { localizeError } from "@/i18n/localize-error";
import { uiCopy } from "@/i18n/ui-copy";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/hanpass-logo.png";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({ meta: [
{ title: uiCopy("pages.reset-password.title") },
{ name: "description", content: uiCopy("pages.reset-password.description") },
{ property: "og:title", content: uiCopy("pages.reset-password.title") },
{ property: "og:description", content: uiCopy("pages.reset-password.description") },
{ property: "og:type", content: "website" },
{ name: "twitter:card", content: "summary" }
] }),
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (password.length < 6) return toast.error(localizeError(t("resetPwd.pwdMin")));
    if (password !== confirm) return toast.error(localizeError(t("resetPwd.mismatch")));
    setBusy(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setBusy(false); return toast.error(localizeError(t("resetPwd.invalid"))); }
    const response = await fetch("/api/public/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return toast.error(localizeError(t("resetPwd.failed", { msg: "password_update_failed" })));
    toast.success(t("resetPwd.success"));
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: "" } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <img src={logo} alt="Hanpass Mobile" className="mx-auto h-14 w-14" width={56} height={56} />
          <CardTitle>{t("resetPwd.title")}</CardTitle>
          <CardDescription>
            {ready ? t("resetPwd.enterNew") : t("resetPwd.checking")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ready ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t("resetPwd.newPwd")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" name="password" type="password" required minLength={6} className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">{t("resetPwd.confirm")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="confirm" name="confirm" type="password" required minLength={6} className="pl-9" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t("resetPwd.changing") : t("resetPwd.change")}
              </Button>
            </form>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-6">
              {t("resetPwd.invalid")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
