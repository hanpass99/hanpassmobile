import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isActive: boolean | null;
  isHanpassStaff: boolean;
  canAccessNewSignup: boolean;
  canAccessTelegram: boolean;
  displayName: string;
  company: string;
  avatarUrl: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHanpassStaff, setIsHanpassStaff] = useState(false);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [company, setCompany] = useState("");
  const [canAccessNewSignup, setCanAccessNewSignup] = useState(false);
  const [canAccessTelegram, setCanAccessTelegram] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const loadProfile = async (uid: string) => {
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("display_name, avatar_url, can_access_new_signup, can_access_telegram, company, is_active, approval_status").eq("id", uid).maybeSingle(),
    ]);
    setIsActive((profile as any)?.approval_status ? (profile as any).approval_status !== "pending" : ((profile as any)?.is_active ?? true));
    setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    setIsHanpassStaff(!!roles?.some((r) => (r.role as string) === "hanpass_staff"));
    setCompany((profile as any)?.company ?? "");
    setDisplayName(profile?.display_name ?? "");
    setAvatarUrl((profile as any)?.avatar_url ?? null);
    setCanAccessNewSignup(!!(profile as any)?.can_access_new_signup);
    setCanAccessTelegram(!!(profile as any)?.can_access_telegram);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setLoading(true);
        setTimeout(() => {
          loadProfile(s.user.id)
            .catch(console.error)
            .finally(() => setLoading(false));
        }, 0);
      } else {
        setIsAdmin(false);
        setIsHanpassStaff(false);
        setIsActive(null);
        setCompany("");
        setCanAccessNewSignup(false);
        setCanAccessTelegram(false);
        setDisplayName("");
        setAvatarUrl(null);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        isHanpassStaff,
        isActive,
        company,
        canAccessNewSignup,
        canAccessTelegram,
        displayName,
        avatarUrl,
        signOut: async () => {
          await supabase.auth.signOut();
        },
        refresh: async () => {
          if (session?.user) await loadProfile(session.user.id);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
