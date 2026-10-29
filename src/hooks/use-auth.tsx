import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isApprovedStaff } from "@/lib/staff-security";
import { mustChangePassword } from "@/lib/password-change";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isActive: boolean | null;
  mustChangePassword: boolean;
  isHanpass: boolean;
  countryIds: string[];
  needsCountry: boolean;
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
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [company, setCompany] = useState("");
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [canAccessNewSignup, setCanAccessNewSignup] = useState(false);
  const [canAccessTelegram, setCanAccessTelegram] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // 프로필을 이미 불러온 사용자 ID. 토큰 갱신(약 1시간마다)이나 탭 재포커스 때
  // 같은 사용자의 이벤트가 다시 와도 앱 전체를 "로딩 중"으로 바꾸지 않기 위해 사용.
  const loadedUidRef = useRef<string | null>(null);
  // 같은 사용자에 대한 중복 프로필 조회(getSession + INITIAL_SESSION 등)를 하나로 합침.
  const inflightRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    const { data: verified, error } = await supabase.auth.getUser();
    if (error || verified.user?.id !== uid) throw new Error("unauthorized");
    const required = mustChangePassword(verified.user.app_metadata);
    setRequiresPasswordChange(required);
    if (required) return;
    const [{ data: roles }, { data: profile }, { data: pcs }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("profiles")
        .select("display_name, avatar_url, can_access_new_signup, can_access_telegram, company, is_active, approval_status")
        .eq("id", uid)
        .maybeSingle(),
      supabase.from("profile_countries").select("country_id").eq("user_id", uid),
    ]);
    setIsActive(isApprovedStaff(profile));
    setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    setCompany((profile as any)?.company ?? "");
    setCountryIds((pcs ?? []).map((r: any) => r.country_id as string));
    setDisplayName(profile?.display_name ?? "");
    setAvatarUrl((profile as any)?.avatar_url ?? null);
    setCanAccessNewSignup(!!(profile as any)?.can_access_new_signup);
    setCanAccessTelegram(!!(profile as any)?.can_access_telegram);
  }, []);

  useEffect(() => {
    let disposed = false;

    const resetSignedOut = () => {
      loadedUidRef.current = null;
      inflightRef.current = null;
      setIsAdmin(false);
      setIsActive(null);
      setRequiresPasswordChange(false);
      setCompany("");
      setCountryIds([]);
      setCanAccessNewSignup(false);
      setCanAccessTelegram(false);
      setDisplayName("");
      setAvatarUrl(null);
      setLoading(false);
    };

    /**
     * 첫 로딩(또는 다른 사용자로 로그인)일 때만 전체 로딩 화면을 보여 줌.
     * 같은 사용자의 USER_UPDATED 등은 화면을 유지한 채 백그라운드로 다시 읽음.
     */
    const ensureProfile = (uid: string, mode: "initial" | "background") => {
      if (inflightRef.current?.uid === uid) return inflightRef.current.promise;
      if (mode === "initial") setLoading(true);
      const promise = loadProfile(uid)
        .then(() => {
          if (!disposed) loadedUidRef.current = uid;
        })
        .catch(() => {
          if (disposed) return;
          // 첫 확인에 실패하면 기존처럼 안전하게 차단. 이미 확인된 사용자의
          // 백그라운드 재조회 실패는 화면을 끊지 않음(데이터 접근은 DB의 RLS가 계속 막음).
          if (mode === "initial") {
            setIsActive(false);
            setRequiresPasswordChange(true);
          }
        })
        .finally(() => {
          if (inflightRef.current?.promise === promise) inflightRef.current = null;
          if (!disposed && mode === "initial") setLoading(false);
        });
      inflightRef.current = { uid, promise };
      return promise;
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // 토큰만 바뀐 경우에는 같은 사용자 객체를 유지해서 하위 컴포넌트의 재구독을 막음
      setSession((prev) => {
        if (prev && s && prev.user.id === s.user.id && event === "TOKEN_REFRESHED") {
          return { ...s, user: prev.user };
        }
        return s;
      });
      if (!s?.user) {
        resetSignedOut();
        return;
      }
      const uid = s.user.id;
      if (loadedUidRef.current !== uid) {
        // supabase 콜백 안에서 다른 supabase 호출을 await 하면 교착될 수 있어 다음 틱으로 미룸
        setTimeout(() => void ensureProfile(uid, "initial"), 0);
      } else if (event === "USER_UPDATED") {
        setTimeout(() => void ensureProfile(uid, "background"), 0);
      }
      // TOKEN_REFRESHED / SIGNED_IN(탭 재포커스) / INITIAL_SESSION(이미 로드됨): 아무것도 다시 읽지 않음
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (disposed) return;
        if (!data.session?.user) {
          setSession(null);
          setLoading(false);
          return;
        }
        setSession((prev) => prev ?? data.session);
        const uid = data.session.user.id;
        if (loadedUidRef.current !== uid) void ensureProfile(uid, "initial");
      })
      .catch(() => {
        if (disposed) return;
        setIsActive(false);
        setRequiresPasswordChange(true);
        setLoading(false);
      });

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const isHanpass = company === "한패스";
  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refresh = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      user,
      loading,
      isAdmin,
      isHanpass,
      isActive,
      mustChangePassword: requiresPasswordChange,
      company,
      countryIds,
      needsCountry: !!session && !isAdmin && isActive !== false && countryIds.length === 0,
      canAccessNewSignup,
      canAccessTelegram,
      displayName,
      avatarUrl,
      signOut,
      refresh,
    }),
    [
      session,
      user,
      loading,
      isAdmin,
      isHanpass,
      isActive,
      requiresPasswordChange,
      company,
      countryIds,
      canAccessNewSignup,
      canAccessTelegram,
      displayName,
      avatarUrl,
      signOut,
      refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
