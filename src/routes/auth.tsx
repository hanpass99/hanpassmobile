import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Mail, Lock, ArrowLeft, ShieldCheck, Languages, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : "",
  }),
  component: AuthPage,
});

function safeNext(next: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

type Mode = "login" | "forgot" | "signup" | "signupDone";

function AuthPage() {
  const { t, i18n: i18nInst } = useTranslation();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = safeNext(next);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [countries, setCountries] = useState<Array<{ id: string; code: string; name_ko: string }>>([]);

  useEffect(() => {
    if (mode !== "signup" || countries.length) return;
    supabase
      .from("countries")
      .select("id, code, name_ko")
      .eq("is_active", true)
      .order("code")
      .then(({ data }) => setCountries((data ?? []) as Array<{ id: string; code: string; name_ko: string }>));
  }, [mode, countries.length]);

  if (loading) return null;
  if (session) return <Navigate to={target} />;

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
    if (target !== "/") window.location.href = target;
    else navigate({ to: "/" });
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const company = String(fd.get("company") ?? "한패스 모바일");
    const countryId = String(fd.get("country_id") ?? "").trim();
    if (!name) return toast.error(t("auth.enterName"));
    if (!countryId) return toast.error(t("country.selectRequired"));
    const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          display_name: name,
          company: company === "한패스" ? "한패스" : "한패스 모바일",
          country_id: countryId,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (error) return toast.error(t("auth.signupFailed", { msg: error.message }));
    setMode("signupDone");
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
      <div className="grid min-h-[100dvh] w-full max-w-5xl overflow-y-auto shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)] md:h-[640px] md:min-h-0 md:grid-cols-2 md:overflow-hidden md:rounded-xl">
        {/* Left brand panel */}
        <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-foreground text-primary">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[20px] font-bold leading-tight">Hanpass Mobile</div>
              <div className="text-[13px] text-primary-foreground/50">OB Call Management</div>
            </div>
          </div>

          <div className="space-y-5">
            <h1 className="text-[22px] font-semibold leading-snug tracking-normal whitespace-nowrap">
              {t("auth.brandTagline")}
            </h1>
            <p className="text-[14px] leading-relaxed text-primary-foreground/70">
              {t("auth.brandSub")}
            </p>
            <div className="flex items-center gap-2 text-[13px] text-primary-foreground/75">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t("auth.adminOnly")}
            </div>
          </div>

          <div className="text-[12px] text-primary-foreground/40">{t("auth.rights")}</div>
        </div>

        {/* Right form panel */}
        <div className="flex flex-col bg-card p-8 md:p-12">
          <div className="flex items-center justify-between mb-8">
            <div className="md:hidden flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-primary">Hanpass Mobile</div>
                <div className="text-[10px] text-muted-foreground">OB Call CRM</div>
              </div>
            </div>
            <button
              onClick={switchLang}
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:opacity-80"
              title={t("common.language")}
            >
              <Languages className="h-4 w-4" />
              {i18nInst.language === "ko" ? "한국어" : "English"}
            </button>
          </div>

          {mode === "login" ? (
            <div className="flex-1 flex flex-col">
              <div className="mb-8">
                <h2 className="text-[24px] font-semibold tracking-normal text-foreground">{t("auth.loginTitle")}</h2>
                <p className="mt-1.5 text-[14px] text-muted-foreground">{t("auth.loginSub")}</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-5 flex-1">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-[13px] font-medium text-foreground">
                    {t("auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="h-11 pl-10 rounded-lg border-border text-primary placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-[13px] font-medium text-foreground">
                      {t("auth.password")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-[13px] font-medium text-primary hover:underline"
                    >
                      {t("auth.forgot")}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="h-11 pl-10 rounded-lg border-border text-primary placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg text-[14px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={busy}
                >
                  {busy ? t("common.processing") : t("auth.login")}
                </Button>
                <p className="text-center text-[13px] text-muted-foreground/70 pt-2">
                  {t("auth.noAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-semibold text-primary hover:underline"
                  >
                    {t("auth.signup")}
                  </button>
                </p>
              </form>
            </div>
          ) : mode === "signup" ? (
            <div className="flex-1 flex flex-col">
              <button
                onClick={() => setMode("login")}
                className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.backToLogin")}
              </button>
              <div className="mb-8">
                <h2 className="text-[24px] font-semibold tracking-normal text-foreground">{t("auth.signupTitle")}</h2>
                <p className="mt-1.5 text-[14px] text-muted-foreground">{t("auth.signupSub")}</p>
              </div>
              <form onSubmit={handleSignup} className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-[13px] font-medium text-foreground">
                    {t("auth.name")}
                  </Label>
                  <Input
                    id="signup-name"
                    name="name"
                    autoComplete="name"
                    required
                    className="h-11 rounded-lg border-border text-primary placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring"
                    placeholder={t("auth.namePlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-company" className="text-[13px] font-medium text-foreground">
                    {t("auth.company")}
                  </Label>
                  <select
                    id="signup-company"
                    name="company"
                    className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue="한패스 모바일"
                  >
                    <option value="한패스">한패스</option>
                    <option value="한패스 모바일">한패스 모바일</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-country" className="text-[13px] font-medium text-foreground">
                    {t("country.label")}
                  </Label>
                  <select
                    id="signup-country"
                    name="country_id"
                    required
                    defaultValue=""
                    className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="" disabled>
                      {t("country.placeholder")}
                    </option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_ko} ({c.code})
                      </option>
                    ))}
                  </select>
                  <p className="text-[12px] text-muted-foreground">{t("country.signupHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-[13px] font-medium text-foreground">
                    {t("auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="h-11 pl-10 rounded-lg border-border text-primary placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-[13px] font-medium text-foreground">
                    {t("auth.password")}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      className="h-11 pl-10 rounded-lg border-border text-primary placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring"
                      placeholder={t("auth.pwdMin")}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg text-[14px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={busy}
                >
                  {busy ? t("common.processing") : t("auth.signupSubmit")}
                </Button>
                <p className="text-center text-[12px] text-muted-foreground/70 pt-1">
                  {t("auth.adminOnly")}
                </p>
              </form>
            </div>
          ) : mode === "signupDone" ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </span>
              <h2 className="text-[22px] font-medium text-primary">{t("auth.signupDoneTitle")}</h2>
              <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">{t("auth.signupDoneSub")}</p>
              <Button
                className="mt-8 h-11 rounded-lg bg-primary px-8 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={() => setMode("login")}
              >
                {t("auth.backToLogin")}
              </Button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <button
                onClick={() => setMode("login")}
                className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.backToLogin")}
              </button>
              <div className="mb-8">
                <h2 className="text-[24px] font-medium text-primary">{t("auth.forgotTitle")}</h2>
                <p className="mt-1.5 text-[14px] text-muted-foreground">{t("auth.forgotSub")}</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-5 flex-1">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className="text-[13px] font-medium text-foreground">
                    {t("auth.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="forgot-email"
                      name="email"
                      type="email"
                      required
                      className="h-11 pl-10 rounded-lg border-border text-primary placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg text-[14px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
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
