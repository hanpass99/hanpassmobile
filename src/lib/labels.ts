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
};

// 상태별 색상 (semantic tokens 기반)
export const STATUS_CLASS: Record<CustomerStatus, string> = {
  new: "bg-muted text-muted-foreground border-transparent",
  in_progress: "bg-info/15 text-info border-transparent",
  no_answer: "bg-warning/15 text-warning-foreground border-transparent",
  not_interested: "bg-muted text-muted-foreground border-transparent",
  callback: "bg-primary-soft text-primary border-transparent",
  activated: "bg-success/15 text-success border-transparent",
  stay_expired: "bg-destructive/10 text-destructive border-transparent",
  delinquent: "bg-destructive/15 text-destructive border-transparent",
  line_exceeded: "bg-destructive/15 text-destructive border-transparent",
  minor: "bg-secondary text-secondary-foreground border-transparent",
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
  "new_signup",
  "prepaid",
  "activation_request",
] as const;
export type CustomerPool = (typeof POOLS)[number];

export const POOL_LABEL: Record<CustomerPool, string> = {
  existing: "한패스 모바일 기존 고객",
  new_signup: "한패스 신규 가입자",
  prepaid: "선불 충전자",
  activation_request: "개통 신청자",
};

export const POOL_SHORT: Record<CustomerPool, string> = {
  existing: "기존 고객",
  new_signup: "신규 가입자",
  prepaid: "선불 충전자",
  activation_request: "개통 신청자",
};
