import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  Navigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CallLogPopupProvider } from "@/components/CallLogPopupProvider";
import { AiAssistant } from "@/components/AiAssistant";
import { AdminPushListener } from "@/components/AdminPushListener";
import { AttendanceCheckInGate } from "@/components/AttendanceCheckInGate";
import { CountrySetupGate } from "@/components/CountrySetupGate";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { useCallGoal } from "@/hooks/use-call-goal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AutoTranslator } from "@/components/AutoTranslator";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">{t("errors.notFoundTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.notFoundDesc")}</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {t("errors.home")}
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{t("errors.errorTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("errors.retry")}
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hanpass Mobile OB Call CRM" },
      { name: "description", content: i18n.t("app.desc") },
      { property: "og:title", content: "Hanpass Mobile OB Call CRM" },
      { name: "twitter:title", content: "Hanpass Mobile OB Call CRM" },
      { property: "og:description", content: i18n.t("app.desc") },
      { name: "twitter:description", content: i18n.t("app.desc") },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/96e0c5b7-82e3-4549-93b5-0c50b870f682/id-preview-eb1cbe12--0aa97a0a-ffc3-4991-bbe0-f78345f76740.lovable.app-1778318358520.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/96e0c5b7-82e3-4549-93b5-0c50b870f682/id-preview-eb1cbe12--0aa97a0a-ffc3-4991-bbe0-f78345f76740.lovable.app-1778318358520.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublicRoute = pathname === "/auth" || pathname === "/reset-password";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {i18n.t("errors.loading")}
      </div>
    );
  }

  if (isPublicRoute) return <Outlet />;
  if (!session) return <Navigate to="/auth" search={{ next: "" }} />;

  return <AuthedShell />;
}

const SECTION_TITLES: Array<[string, string]> = [
  ["/customers", "고객 관리"],
  ["/sms", "문자 발송"],
  ["/telegram", "텔레그램 상담"],
  ["/call-logs", "통화 기록"],
  ["/channel-performance", "채널 성과"],
  ["/sla", "SLA 관리"],
  ["/notifications", "관리자 공지"],
  ["/broadcast", "브로드캐스트"],
  ["/ai-faq", "AI 학습"],
  ["/ai-assistant", "AI 어시스턴트"],
  ["/staff", "직원 관리"],
  ["/attendance", "출근 관리"],
  ["/settings", "설정"],
];

function useSectionTitle(pathname: string) {
  if (pathname === "/") return "대시보드";
  return SECTION_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "";
}

function AuthedShell() {
  useCallGoal();
  const { isAdmin, isHanpass, isActive, needsCountry, signOut, displayName } = useAuth();
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNavigating = useRouterState({ select: (s) => s.status === "pending" });
  const sectionTitle = useSectionTitle(pathname);
  if (isActive === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">H</span>
        <h1 className="text-xl font-bold text-foreground">{t("auth.pendingTitle")}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("auth.pendingSub")}</p>
        {displayName && <p className="mt-1 text-xs text-muted-foreground/70">{displayName}</p>}
        <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
          {t("auth.pendingSignOut")}
        </Button>
      </div>
    );
  }
  if (needsCountry) {
    return <CountrySetupGate />;
  }
  if (isHanpass && !pathname.startsWith("/customers")) {
    return <Navigate to="/customers" search={{ pool: "activation_request" }} />;
  }
  return (
    <AttendanceCheckInGate>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-header px-4 text-header-foreground shadow-sm md:px-6">
              <SidebarTrigger className="text-header-foreground/80 hover:bg-white/10 hover:text-header-foreground" />
              <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <Link to="/" className="hidden items-center gap-2 font-medium text-header-foreground/70 hover:text-header-foreground sm:inline-flex">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-brand text-[10px] font-black text-brand-foreground">H</span>
                  Hanpass Mobile
                </Link>
                {sectionTitle && (
                  <>
                    <span className="hidden text-header-foreground/30 sm:inline">/</span>
                    <span className="truncate font-display font-semibold text-header-foreground">{sectionTitle}</span>
                  </>
                )}
              </nav>
              <div className="flex-1" />
              <span className="hidden items-center gap-2 rounded-full border border-header-foreground/15 bg-header-foreground/10 px-2.5 py-1 text-[10px] font-medium tracking-normal text-header-foreground/90 lg:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                OB Call Management
              </span>
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand transition-opacity duration-200 ${
                  isNavigating ? "animate-pulse opacity-100" : "opacity-0"
                }`}
              />
            </header>

            <main className="min-w-0 flex-1 p-4 md:p-5">
              <Outlet />
            </main>
          </div>
        </div>
        <CallLogPopupProvider />
        <AiAssistant />
        <AdminPushListener />
      </SidebarProvider>
    </AttendanceCheckInGate>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
            <AuthGate />
          </ErrorBoundary>
          <Toaster richColors position="top-right" />
          <AutoTranslator />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
