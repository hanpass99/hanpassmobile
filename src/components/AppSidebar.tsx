import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Globe2,
  Radio,
  FileBarChart,
  Settings,
  Phone,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard },
  { title: "고객 관리", url: "/customers", icon: Users },
];

const analyticsItems = [
  { title: "직원 성과", url: "/staff-performance", icon: UserCog },
  { title: "국가별 성과", url: "/country-performance", icon: Globe2 },
  { title: "채널별 성과", url: "/channel-performance", icon: Radio },
  { title: "리포트", url: "/reports", icon: FileBarChart },
];

const systemItems = [{ title: "설정", url: "/settings", icon: Settings }];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  const renderItems = (items: typeof mainItems) =>
    items.map((item) => (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
          <Link to={item.url} className="flex items-center gap-3">
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Phone className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-tight">Hanpass Mobile</span>
            <span className="text-xs text-muted-foreground">OB Call CRM</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>메인</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(mainItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>분석</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(analyticsItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>시스템</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(systemItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserFooter />
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarUserFooter() {
  const { user, displayName, isAdmin, signOut } = useAuth();
  if (!user) return null;
  const initial = (displayName || user.email || "U").trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initial}
      </div>
      <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
        <span className="truncate text-xs font-medium">{displayName || user.email}</span>
        <span className="text-[10px] text-muted-foreground">{isAdmin ? "Admin" : "Staff"}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 group-data-[collapsible=icon]:hidden"
        onClick={() => signOut()}
        title="로그아웃"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

