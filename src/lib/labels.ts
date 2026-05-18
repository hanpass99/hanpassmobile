// 한패스 OB CRM — DB enum과 한국어 라벨 매핑

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

export const CALL_RESULT_LABEL: Record<CallResult, string> = {
  no_answer: "부재중",
  wrong_number: "번호 오류",
  callback: "재연락 예정",
  not_interested: "관심 없음",
  interested: "성공(관심)",
  activated: "개통 완료",
  failed: "실패",
};

// 새 10종 상태값 (사용자 요청 순서)
export const CUSTOMER_STATUSES = [
  "new",
  "in_progress",
  "no_answer",
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

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  new: "미처리",
  in_progress: "진행중",
  no_answer: "부재",
  not_interested: "관심 없음",
  callback: "재연락 요청",
  activated: "개통 완료",
  stay_expired: "체류 기간 만료",
  delinquent: "체납자",
  line_exceeded: "회선 초과",
  minor: "미성년자",
  wrong_application: "오신청",
  seasonal_worker: "계절 근로자",
};

// 상태별 색상 — 파스텔톤, 12종 시각적 구분, 라이트/다크 모두 가독성 확보
export const STATUS_CLASS: Record<CustomerStatus, string> = {
  new:               "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-800/60 dark:text-slate-200",
  in_progress:       "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-900/40 dark:text-sky-200",
  no_answer:         "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-900/40 dark:text-amber-200",
  not_interested:    "bg-orange-100 text-orange-800 border-transparent dark:bg-orange-900/40 dark:text-orange-200",
  callback:          "bg-blue-100 text-blue-800 border-transparent dark:bg-blue-900/40 dark:text-blue-200",
  activated:         "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-900/40 dark:text-emerald-200",
  stay_expired:      "bg-pink-100 text-pink-800 border-transparent dark:bg-pink-900/40 dark:text-pink-200",
  delinquent:        "bg-rose-100 text-rose-800 border-transparent dark:bg-rose-900/40 dark:text-rose-200",
  line_exceeded:     "bg-violet-100 text-violet-800 border-transparent dark:bg-violet-900/40 dark:text-violet-200",
  minor:             "bg-indigo-100 text-indigo-800 border-transparent dark:bg-indigo-900/40 dark:text-indigo-200",
  wrong_application: "bg-stone-100 text-stone-800 border-transparent dark:bg-stone-800/60 dark:text-stone-200",
  seasonal_worker:   "bg-teal-100 text-teal-800 border-transparent dark:bg-teal-900/40 dark:text-teal-200",
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
] as const;
export type CustomerPool = (typeof POOLS)[number];

export const POOL_LABEL: Record<CustomerPool, string> = {
  existing: "한패스 모바일 기존 고객",
  activation_request: "개통 신청자",
};

export const POOL_SHORT: Record<CustomerPool, string> = {
  existing: "기존 고객",
  activation_request: "개통 신청자",
};
