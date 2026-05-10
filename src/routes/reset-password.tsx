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

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

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
    if (password.length < 6) return toast.error(t("resetPwd.pwdMin"));
    if (password !== confirm) return toast.error(t("resetPwd.mismatch"));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(t("resetPwd.failed", { msg: error.message }));
    toast.success(t("resetPwd.success"));
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
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
