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

// 상태별 색상 — 12종 모두 시각적으로 구분되도록 고유 색상 부여
export const STATUS_CLASS: Record<CustomerStatus, string> = {
  new: "bg-slate-200 text-slate-800 border-transparent dark:bg-slate-700 dark:text-slate-100",
  in_progress: "bg-sky-200 text-sky-900 border-transparent dark:bg-sky-800 dark:text-sky-50",
  no_answer: "bg-yellow-200 text-yellow-900 border-transparent dark:bg-yellow-700 dark:text-yellow-50",
  not_interested: "bg-orange-300 text-orange-950 border-transparent dark:bg-orange-700 dark:text-orange-50",
  callback: "bg-blue-300 text-blue-950 border-transparent dark:bg-blue-700 dark:text-blue-50",
  activated: "bg-green-300 text-green-950 border-transparent dark:bg-green-700 dark:text-green-50",
  stay_expired: "bg-pink-300 text-pink-950 border-transparent dark:bg-pink-700 dark:text-pink-50",
  delinquent: "bg-red-400 text-red-950 border-transparent dark:bg-red-700 dark:text-red-50",
  line_exceeded: "bg-purple-300 text-purple-950 border-transparent dark:bg-purple-700 dark:text-purple-50",
  minor: "bg-indigo-400 text-indigo-50 border-transparent dark:bg-indigo-700 dark:text-indigo-50",
  wrong_application: "bg-amber-700 text-amber-50 border-transparent dark:bg-amber-800 dark:text-amber-50",
  seasonal_worker: "bg-teal-300 text-teal-950 border-transparent dark:bg-teal-700 dark:text-teal-50",
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
