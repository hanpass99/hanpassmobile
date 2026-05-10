import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Mail, Lock, ArrowLeft, ShieldCheck, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/hanpass-logo.png";

export const Route = createFileRoute("/auth")({ component: AuthPage });

type Mode = "login" | "forgot";

function AuthPage() {
  const { t, i18n: i18nInst } = useTranslation();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  if (loading) return null;
  if (session) return <Navigate to="/" />;

  const loginSchema = z.object({
    email: z.string().trim().email({ message: t("auth.invalidEmail") }).max(255),
    password: z.string().min(6, { message: t("auth.pwdMin") }).max(100),
  });

  const switchLang = () => {
    const next = i18nInst.language === "ko" ? "en" : "ko";
    i18nInst.changeLanguage(next);
    localStorage.setItem("lang", next);
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) return toast.error(t("auth.loginFailed", { msg: error.message }));
    toast.success(t("auth.welcome"));
    navigate({ to: "/" });
  };

  const handleForgot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    if (!email) return toast.error(t("auth.enterEmail"));
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.linkSent"));
    setMode("login");
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] md:grid-cols-2">
        {/* Left brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0a2463] via-[#1e3a8a] to-[#3b82f6] p-10 text-white md:flex">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[#e63946]/20 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-white/95 p-2 shadow-lg">
              <img src={logo} alt="Hanpass Mobile" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">Hanpass Mobile</div>
              <div className="text-xs opacity-80">OB Call Management</div>
            </div>
          </div>

          <div className="relative space-y-5">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              {t("auth.brandTagline")}
            </h1>
            <p className="text-sm leading-relaxed opacity-90">
              {t("auth.brandSub")}
            </p>
            <div className="flex items-center gap-2 text-xs opacity-75">
              <ShieldCheck className="h-4 w-4" />
              {t("auth.adminOnly")}
            </div>
          </div>

          <div className="relative text-xs opacity-60">{t("auth.rights")}</div>
        </div>

        {/* Right form panel */}
        <div className="p-8 md:p-12">
          <div className="flex items-center justify-between mb-6 md:mb-4">
            <div className="md:hidden flex items-center gap-3">
              <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-white p-1.5 shadow-sm border border-border/60">
                <img src={logo} alt="Hanpass Mobile" className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="font-bold">Hanpass Mobile</div>
                <div className="text-[10px] text-muted-foreground">OB Call CRM</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={switchLang} className="ml-auto h-8 gap-1.5 text-xs" title={t("common.language")}>
              <Languages className="h-3.5 w-3.5" />
              {i18nInst.language === "ko" ? "한국어" : "English"}
            </Button>
          </div>

          {mode === "login" ? (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold tracking-tight">{t("auth.loginTitle")}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{t("auth.loginSub")}</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-semibold">{t("auth.email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="login-email" name="email" type="email" autoComplete="email" required className="h-11 pl-9" placeholder="you@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-xs font-semibold">{t("auth.password")}</Label>
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs font-medium text-primary hover:underline">
                      {t("auth.forgot")}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="login-password" name="password" type="password" autoComplete="current-password" required className="h-11 pl-9" />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold mt-2" disabled={busy}>
                  {busy ? t("common.processing") : t("auth.login")}
                </Button>
                <p className="text-center text-xs text-muted-foreground/80 pt-3 border-t border-border/40">
                  {t("auth.accountNote")}
                </p>
              </form>
            </>
          ) : (
            <>
              <button onClick={() => setMode("login")} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.backToLogin")}
              </button>
              <div className="mb-7">
                <h2 className="text-2xl font-bold tracking-tight">{t("auth.forgotTitle")}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t("auth.forgotSub")}
                </p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-xs font-semibold">{t("auth.email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="forgot-email" name="email" type="email" required className="h-11 pl-9" placeholder="you@example.com" />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={busy}>
                  {busy ? t("auth.sending") : t("auth.sendLink")}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
