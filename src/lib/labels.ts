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

export const CUSTOMER_STATUSES = [
  "new",
  "contacted",
  "in_progress",
  "activated",
  "failed",
  "do_not_call",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  new: "미처리",
  contacted: "처리중",
  in_progress: "개통 처리 중",
  activated: "개통 완료",
  failed: "실패",
  do_not_call: "거부",
};

export const STATUS_CLASS: Record<CustomerStatus, string> = {
  new: "bg-muted text-muted-foreground",
  contacted: "bg-info/15 text-info",
  in_progress: "bg-primary-soft text-primary",
  activated: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  do_not_call: "bg-muted text-muted-foreground",
};

// 콜 결과 → 자동 상태 추천
export function statusForResult(r: CallResult): CustomerStatus {
  switch (r) {
    case "activated": return "activated";
    case "interested": return "in_progress";
    case "callback": return "contacted";
    case "not_interested": return "do_not_call";
    case "failed":
    case "wrong_number": return "failed";
    case "no_answer": return "new";
  }
}
