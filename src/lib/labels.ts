// 한패스 OB CRM — DB enum ↔ i18n 라벨 매핑
// 라벨 문자열은 i18n(ko/en)에서 동적으로 조회합니다.
// Proxy를 사용해 기존 호출 패턴(LABEL[key])을 그대로 유지하면서 언어 전환에 반응합니다.
import i18n from "@/i18n";

function i18nMap<K extends string>(prefix: string) {
  return new Proxy({} as Record<K, string>, {
    get: (_t, key: string) => i18n.t(`${prefix}.${key}`),
    // 배열/객체 순회용 (Object.keys 등)
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

export const CALL_RESULTS = [
  "no_answer",
  "wrong_number",
  "callback",
  "not_interested",
  "interested",
  "activated",
  "failed",
] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

export const CALL_RESULT_LABEL = i18nMap<CallResult>("callResult");

// 새 10종 상태값 (사용자 요청 순서)
export const CUSTOMER_STATUSES = [
  "new",
  "in_progress",
  "no_answer",
  "unreachable",
  "not_interested",
  "callback",
  "activated",
  "stay_expired",
  "delinquent",
  "line_exceeded",
  "minor",
  "wrong_application",
  "seasonal_worker",
  "suspended_number",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const STATUS_LABEL = i18nMap<CustomerStatus>("status");

// 상태별 색상 — 파스텔톤, 13종 시각적 구분, 라이트/다크 모두 가독성 확보
export const STATUS_CLASS: Record<CustomerStatus, string> = {
  new:               "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-800/60 dark:text-slate-200",
  in_progress:       "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-900/40 dark:text-sky-200",
  no_answer:         "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-900/40 dark:text-amber-200",
  unreachable:       "bg-yellow-100 text-yellow-800 border-transparent dark:bg-yellow-900/40 dark:text-yellow-200",
  not_interested:    "bg-orange-100 text-orange-800 border-transparent dark:bg-orange-900/40 dark:text-orange-200",
  callback:          "bg-blue-100 text-blue-800 border-transparent dark:bg-blue-900/40 dark:text-blue-200",
  activated:         "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-900/40 dark:text-emerald-200",
  stay_expired:      "bg-pink-100 text-pink-800 border-transparent dark:bg-pink-900/40 dark:text-pink-200",
  delinquent:        "bg-rose-100 text-rose-800 border-transparent dark:bg-rose-900/40 dark:text-rose-200",
  line_exceeded:     "bg-violet-100 text-violet-800 border-transparent dark:bg-violet-900/40 dark:text-violet-200",
  minor:             "bg-indigo-100 text-indigo-800 border-transparent dark:bg-indigo-900/40 dark:text-indigo-200",
  wrong_application: "bg-stone-100 text-stone-800 border-transparent dark:bg-stone-800/60 dark:text-stone-200",
  seasonal_worker:   "bg-teal-100 text-teal-800 border-transparent dark:bg-teal-900/40 dark:text-teal-200",
  suspended_number:  "bg-fuchsia-100 text-fuchsia-800 border-transparent dark:bg-fuchsia-900/40 dark:text-fuchsia-200",
};

// 콜 결과 → 자동 상태 추천
export function statusForResult(r: CallResult): CustomerStatus {
  switch (r) {
    case "activated": return "activated";
    case "interested": return "in_progress";
    case "callback": return "callback";
    case "not_interested": return "not_interested";
    case "failed":
    case "wrong_number": return "no_answer";
    case "no_answer": return "no_answer";
  }
}

// === Pool (고객 풀) ===
export const POOLS = [
  "existing",
  "activation_request",
  "google_form_activation",
  "google_form_activation_inter",
  "friend_referral",
  "prepaid_charge",
  "one_year_activation",
] as const;
export type CustomerPool = (typeof POOLS)[number];

export const POOL_LABEL = i18nMap<CustomerPool>("pool");
export const POOL_SHORT = i18nMap<CustomerPool>("pool.short");

// === 직원 출근 상태 ===
export const ATTENDANCE_STATUSES = [
  "present",
  "day_off",
  "annual_leave",
  "half_day",
  "training",
  "sick_leave",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABEL = i18nMap<AttendanceStatus>("attendance.status");

export const ATTENDANCE_CLASS: Record<AttendanceStatus, string> = {
  present:      "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-900/40 dark:text-emerald-200",
  day_off:      "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-800/60 dark:text-slate-200",
  annual_leave: "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-900/40 dark:text-sky-200",
  half_day:     "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-900/40 dark:text-amber-200",
  training:     "bg-violet-100 text-violet-800 border-transparent dark:bg-violet-900/40 dark:text-violet-200",
  sick_leave:   "bg-rose-100 text-rose-800 border-transparent dark:bg-rose-900/40 dark:text-rose-200",
};
