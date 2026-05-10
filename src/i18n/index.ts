import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const ko = {
  nav: {
    main: "메인", analytics: "분석", system: "시스템",
    dashboard: "대시보드", customers: "고객 관리",
    staff: "직원 성과", country: "국가별 성과", channel: "채널별 성과",
    reports: "리포트", settings: "설정",
  },
  common: {
    logout: "로그아웃", admin: "관리자", staff: "직원",
    refresh: "새로고침", cancel: "취소", delete: "삭제",
    save: "저장", search: "검색", reset: "초기화",
    language: "언어", theme: "테마", dark: "다크", light: "라이트",
    selectAll: "전체 선택", deleteSelected: "선택 삭제",
    confirmBulkDelete: "선택한 {{count}}명의 고객을 삭제하시겠습니까?",
    startDate: "시작일", endDate: "종료일", registeredDate: "데이터 등록일",
  },
  dashboard: {
    title: "대시보드",
    subtitle: "OB 콜 운영 현황 (고객 상태 기준)",
    totalCalls: "전체 콜수",
    activated: "개통 완료",
    activationRate: "개통 완료율",
    activationRateHint: "개통완료 / 전체 콜수",
    callSuccessRate: "콜 성공률",
  },
  goal: {
    title: "오늘의 콜 목표",
    progress: "{{count}}콜 진행 — 오늘 최소 50개 이상 콜 진행해야 합니다.",
    achieved: "🎉 오늘 50콜 목표 달성! 수고하셨습니다.",
  },
};

const en = {
  nav: {
    main: "Main", analytics: "Analytics", system: "System",
    dashboard: "Dashboard", customers: "Customers",
    staff: "Staff Performance", country: "Country Performance", channel: "Channel Performance",
    reports: "Reports", settings: "Settings",
  },
  common: {
    logout: "Sign out", admin: "Admin", staff: "Staff",
    refresh: "Refresh", cancel: "Cancel", delete: "Delete",
    save: "Save", search: "Search", reset: "Reset",
    language: "Language", theme: "Theme", dark: "Dark", light: "Light",
    selectAll: "Select all", deleteSelected: "Delete selected",
    confirmBulkDelete: "Delete the selected {{count}} customers?",
    startDate: "Start date", endDate: "End date", registeredDate: "Registered date",
  },
  dashboard: {
    title: "Dashboard",
    subtitle: "OB Call operations (by customer status)",
    totalCalls: "Total calls",
    activated: "Activated",
    activationRate: "Activation rate",
    activationRateHint: "Activated / Total calls",
    callSuccessRate: "Call success rate",
  },
  goal: {
    title: "Today's call goal",
    progress: "{{count}} calls done — at least 50 calls needed today.",
    achieved: "🎉 50-call daily goal reached. Great work!",
  },
};

i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: typeof window !== "undefined" ? localStorage.getItem("lang") || "ko" : "ko",
  fallbackLng: "ko",
  interpolation: { escapeValue: false },
});

export default i18n;
