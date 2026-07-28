import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Radio, AlertTriangle,
  Settings, Phone, LogOut, Moon, Sun, Languages, MessageSquare, PhoneCall, Bot, Bell, Send,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";


function useTelegramUnreadTotal(enabled: boolean) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const refresh = async () => {
      const { data } = await supabase
        .from("telegram_chats")
        .select("unread_count");
      if (!mounted) return;
      const sum = (data ?? []).reduce((a, r: any) => a + (r.unread_count ?? 0), 0);
      setTotal(sum);
    };
    refresh();
    const ch = supabase
      .channel("sidebar-telegram-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telegram_chats" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [enabled]);
  return total;
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useTranslation();
  const { isAdmin, canAccessTelegram } = useAuth();
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));
  const telegramEnabled = isAdmin || canAccessTelegram;
  const telegramUnread = useTelegramUnreadTotal(telegramEnabled);

  const mainItems = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
    { title: t("nav.customers"), url: "/customers", icon: Users },
    { title: t("nav.sms"), url: "/sms", icon: MessageSquare },
    ...(telegramEnabled
      ? [{ title: "텔레그램 상담", url: "/telegram", icon: Send, badge: telegramUnread }]
      : []),
    { title: t("nav.callLogs"), url: "/call-logs", icon: PhoneCall },
  ] as Array<{ title: string; url: string; icon: typeof LayoutDashboard; badge?: number }>;
  const analyticsItems = [
    { title: t("nav.channel"), url: "/channel-performance", icon: Radio },
    { title: t("nav.sla"), url: "/sla", icon: AlertTriangle },
  ];
  const systemItems = [
    ...(isAdmin ? [{ title: "관리자 공지", url: "/notifications", icon: Bell }] : []),
    ...(isAdmin ? [{ title: "AI 학습", url: "/ai-faq", icon: Bot }] : []),
    { title: t("nav.settings"), url: "/settings", icon: Settings },
    { title: "AI 어시스턴트", url: "/ai-assistant", icon: Bot },
  ];

  const renderItems = (items: typeof mainItems) =>
    items.map((item) => {
      const active = isActive(item.url);
      return (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton
            asChild
            isActive={active}
            tooltip={item.title}
            className={cn(
              "text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground",
              "data-[active=true]:bg-white/[0.12] data-[active=true]:text-sidebar-foreground data-[active=true]:font-medium",
            )}
          >
            <Link to={item.url} className="flex items-center gap-3">
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.title}</span>
              {item.badge && item.badge > 0 ? (
                <span className="ml-auto rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white group-data-[collapsible=icon]:hidden">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Phone className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-semibold leading-tight text-sidebar-foreground">Hanpass Mobile</span>
            <span className="text-xs text-sidebar-foreground/50">OB Call CRM</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/30">{t("nav.main")}</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(mainItems)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/30">{t("nav.analytics")}</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(analyticsItems)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/30">{t("nav.system")}</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(systemItems)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">

        <SidebarPrefs />
        <SidebarUserFooter />
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarPrefs() {
  const { theme, toggle } = useTheme();
  const { i18n: i18nInst } = useTranslation();
  const switchLang = () => {
    const next = i18nInst.language === "ko" ? "en" : "ko";
    i18nInst.changeLanguage(next);
    localStorage.setItem("lang", next);
  };
  return (
    <div className="flex items-center gap-1 px-2 py-1 group-data-[collapsible=icon]:hidden">
      <Button variant="ghost" size="sm" className="h-8 flex-1 justify-start gap-2 text-xs" onClick={switchLang} title="Language">
        <Languages className="h-4 w-4" />
        {i18nInst.language === "ko" ? "한국어" : "English"}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle} title="Theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function SidebarUserFooter() {
  const { user, displayName, isAdmin, signOut, avatarUrl } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;
  const initial = (displayName || user.email || "U").trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName || ""} className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
        <span className="truncate text-xs font-medium">{displayName || user.email}</span>
        <span className="text-[10px] text-muted-foreground">{isAdmin ? t("common.admin") : t("common.staff")}</span>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 group-data-[collapsible=icon]:hidden"
        onClick={() => signOut()} title={t("common.logout")}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
