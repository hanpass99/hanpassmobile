import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Mail, Lock, ArrowLeft, ShieldCheck, Languages, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
    <div className="min-h-screen w-full flex items-center justify-center">
      <div className="grid w-full max-w-5xl min-h-screen md:min-h-0 md:h-[640px] overflow-hidden md:rounded-xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)] md:grid-cols-2">
        {/* Left brand panel */}
        <div className="relative hidden flex-col justify-between bg-[#1E3A5F] p-10 text-white md:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[#1E3A5F]">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[20px] font-bold leading-tight">Hanpass Mobile</div>
              <div className="text-[13px] text-white/50">OB Call Management</div>
            </div>
          </div>

          <div className="space-y-5">
            <h1 className="text-[22px] font-bold leading-snug tracking-tight whitespace-nowrap">
              {t("auth.brandTagline")}
            </h1>
            <p className="text-[14px] leading-relaxed text-white/70">
              {t("auth.brandSub")}
            </p>
            <div className="flex items-center gap-2 text-[13px] text-white/75">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t("auth.adminOnly")}
            </div>
          </div>

          <div className="text-[12px] text-white/40">{t("auth.rights")}</div>
        </div>

        {/* Right form panel */}
        <div className="flex flex-col bg-white p-8 md:p-12">
          <div className="flex items-center justify-between mb-8">
            <div className="md:hidden flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1E3A5F] text-white">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#1E3A5F]">Hanpass Mobile</div>
                <div className="text-[10px] text-[#64748B]">OB Call CRM</div>
              </div>
            </div>
            <button
              onClick={switchLang}
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1E3A5F] hover:opacity-80"
              title={t("common.language")}
            >
              <Languages className="h-4 w-4" />
              {i18nInst.language === "ko" ? "한국어" : "English"}
            </button>
          </div>

          {mode === "login" ? (
            <div className="flex-1 flex flex-col">
              <div className="mb-8">
                <h2 className="text-[24px] font-medium text-[#1E3A5F]">{t("auth.loginTitle")}</h2>
                <p className="mt-1.5 text-[14px] text-[#64748B]">{t("auth.loginSub")}</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-5 flex-1">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-[13px] font-medium text-[#374151]">
                    {t("auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="h-11 pl-10 rounded-lg border-[#E2E8F0] text-[#1E3A5F] placeholder:text-[#94A3B8] focus-visible:border-[#1E3A5F] focus-visible:ring-[#1E3A5F]"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-[13px] font-medium text-[#374151]">
                      {t("auth.password")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-[13px] font-medium text-[#1E3A5F] hover:underline"
                    >
                      {t("auth.forgot")}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="h-11 pl-10 rounded-lg border-[#E2E8F0] text-[#1E3A5F] placeholder:text-[#94A3B8] focus-visible:border-[#1E3A5F] focus-visible:ring-[#1E3A5F]"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg text-[14px] font-semibold bg-[#1E3A5F] text-white hover:bg-[#152D4A]"
                  disabled={busy}
                >
                  {busy ? t("common.processing") : t("auth.login")}
                </Button>
                <p className="text-center text-[13px] text-[#94A3B8] pt-2">
                  {t("auth.accountNote")}
                </p>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <button
                onClick={() => setMode("login")}
                className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#64748B] hover:text-[#1E3A5F]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.backToLogin")}
              </button>
              <div className="mb-8">
                <h2 className="text-[24px] font-medium text-[#1E3A5F]">{t("auth.forgotTitle")}</h2>
                <p className="mt-1.5 text-[14px] text-[#64748B]">{t("auth.forgotSub")}</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-5 flex-1">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className="text-[13px] font-medium text-[#374151]">
                    {t("auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <Input
                      id="forgot-email"
                      name="email"
                      type="email"
                      required
                      className="h-11 pl-10 rounded-lg border-[#E2E8F0] text-[#1E3A5F] placeholder:text-[#94A3B8] focus-visible:border-[#1E3A5F] focus-visible:ring-[#1E3A5F]"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg text-[14px] font-semibold bg-[#1E3A5F] text-white hover:bg-[#152D4A]"
                  disabled={busy}
                >
                  {busy ? t("auth.sending") : t("auth.sendLink")}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
