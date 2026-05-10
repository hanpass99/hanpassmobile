import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Mail, Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/hanpass-logo.png";

export const Route = createFileRoute("/auth")({ component: AuthPage });

const loginSchema = z.object({
  email: z.string().trim().email({ message: "올바른 이메일을 입력하세요" }).max(255),
  password: z.string().min(6, { message: "6자 이상" }).max(100),
});

type Mode = "login" | "forgot";

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  if (loading) return null;
  if (session) return <Navigate to="/" />;

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) return toast.error("로그인 실패: " + error.message);
    toast.success("환영합니다");
    navigate({ to: "/" });
  };

  const handleForgot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    if (!email) return toast.error("이메일을 입력하세요");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("재설정 링크를 이메일로 발송했습니다");
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
              아웃바운드 콜 운영의<br />새로운 표준
            </h1>
            <p className="text-sm leading-relaxed opacity-90">
              고객 데이터 관리부터 실적 분석까지,<br />
              한 곳에서 효율적으로 운영하세요.
            </p>
            <div className="flex items-center gap-2 text-xs opacity-75">
              <ShieldCheck className="h-4 w-4" />
              관리자 승인 계정만 접속 가능
            </div>
          </div>

          <div className="relative text-xs opacity-60">© 2026 Hanpass Mobile. All rights reserved.</div>
        </div>

        {/* Right form panel */}
        <div className="p-8 md:p-12">
          <div className="md:hidden mb-6 flex items-center gap-3">
            <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-white p-1.5 shadow-sm border border-border/60">
              <img src={logo} alt="Hanpass Mobile" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="font-bold">Hanpass Mobile</div>
              <div className="text-[10px] text-muted-foreground">OB Call CRM</div>
            </div>
          </div>

          {mode === "login" ? (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold tracking-tight">관리자 로그인</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">계정 정보를 입력해 주세요</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-semibold">이메일</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="login-email" name="email" type="email" autoComplete="email" required className="h-11 pl-9" placeholder="you@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-xs font-semibold">비밀번호</Label>
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs font-medium text-primary hover:underline">
                      비밀번호 찾기
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="login-password" name="password" type="password" autoComplete="current-password" required className="h-11 pl-9" />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold mt-2" disabled={busy}>
                  {busy ? "처리 중..." : "로그인"}
                </Button>
                <p className="text-center text-xs text-muted-foreground/80 pt-3 border-t border-border/40">
                  계정 발급은 관리자에게 요청해 주세요.
                </p>
              </form>
            </>
          ) : (
            <>
              <button onClick={() => setMode("login")} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> 로그인으로
              </button>
              <div className="mb-7">
                <h2 className="text-2xl font-bold tracking-tight">비밀번호 찾기</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  가입한 이메일로 재설정 링크를 보내드립니다.
                </p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-xs font-semibold">이메일</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="forgot-email" name="email" type="email" required className="h-11 pl-9" placeholder="you@example.com" />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={busy}>
                  {busy ? "발송 중..." : "재설정 링크 받기"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
