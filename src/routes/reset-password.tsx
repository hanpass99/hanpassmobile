import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/hanpass-logo.png";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase가 URL hash에서 세션을 자동 복원합니다.
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
    if (password.length < 6) return toast.error("비밀번호는 6자 이상이어야 합니다");
    if (password !== confirm) return toast.error("비밀번호가 일치하지 않습니다");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error("실패: " + error.message);
    toast.success("비밀번호가 변경되었습니다. 다시 로그인해 주세요.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <img src={logo} alt="Hanpass Mobile" className="mx-auto h-14 w-14" width={56} height={56} />
          <CardTitle>비밀번호 재설정</CardTitle>
          <CardDescription>
            {ready ? "새 비밀번호를 입력하세요" : "재설정 링크를 확인하는 중..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ready ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">새 비밀번호</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" name="password" type="password" required minLength={6} className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">비밀번호 확인</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="confirm" name="confirm" type="password" required minLength={6} className="pl-9" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </form>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-6">
              유효하지 않은 링크이거나 만료되었습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
