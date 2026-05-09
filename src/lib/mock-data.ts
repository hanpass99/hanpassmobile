// 한패스 모바일 OB Call CRM - 목업 데이터

export const CHANNELS = [
  "한패스 모바일 기존 고객",
  "한패스 앱으로 타사 충전 고객",
  "한패스 앱 신규 회원 가입자",
  "한패스 앱 개통 신청자",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const COUNTRIES = [
  { code: "CIS", name: "CIS" },
  { code: "KH", name: "캄보디아" },
  { code: "VN", name: "베트남" },
  { code: "MM", name: "미얀마" },
  { code: "PH", name: "필리핀" },
  { code: "LK", name: "스리랑카" },
  { code: "BD", name: "방글라데시" },
  { code: "TH", name: "태국" },
  { code: "NP", name: "네팔" },
  { code: "ID", name: "인도네시아" },
  { code: "CN", name: "중국" },
] as const;

export const CALL_RESULTS = [
  "성공",
  "실패",
  "부재중",
  "번호 오류",
  "관심 없음",
  "재연락 예정",
  "연락 요청",
  "개통 처리 중",
  "개통 완료",
] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

export const STATUSES = [
  "미처리",
  "처리중",
  "재연락 필요",
  "개통 처리 중",
  "개통 완료",
  "거부",
  "실패",
] as const;
export type Status = (typeof STATUSES)[number];

export const PLANS = [
  "한패스 알뜰 5GB",
  "한패스 알뜰 11GB",
  "한패스 알뜰 무제한",
  "한패스 데이터 100GB",
];

export type Staff = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  monthlyTarget: number;
};

export const STAFF: Staff[] = [
  { id: "u1", name: "김민수 매니저", email: "minsoo@hanpass.kr", role: "admin", monthlyTarget: 200 },
  { id: "u2", name: "이지은", email: "jieun@hanpass.kr", role: "staff", monthlyTarget: 120 },
  { id: "u3", name: "박서준", email: "seojun@hanpass.kr", role: "staff", monthlyTarget: 120 },
  { id: "u4", name: "정수아", email: "sua@hanpass.kr", role: "staff", monthlyTarget: 100 },
  { id: "u5", name: "최도현", email: "dohyun@hanpass.kr", role: "staff", monthlyTarget: 100 },
  { id: "u6", name: "한예린", email: "yerin@hanpass.kr", role: "staff", monthlyTarget: 100 },
];

export type Customer = {
  id: string;
  name: string;
  phone: string;
  country: string;
  channel: Channel;
  assignedStaffId: string;
  callDate: string | null;
  callTime: string | null;
  callResult: CallResult | null;
  status: Status;
  planName: string | null;
  activationDate: string | null;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

const FIRST_NAMES = ["Nguyen", "Tran", "Le", "Phan", "Bui", "Aung", "Min", "Kyaw", "Rahim", "Karim", "Hassan", "Wang", "Li", "Chen", "Sok", "Chan", "Dela Cruz", "Reyes", "Santos", "Perera", "Silva", "Khan", "Ali"];
const LAST_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randPhone() {
  return `010-${String(Math.floor(1000 + Math.random() * 9000))}-${String(
    Math.floor(1000 + Math.random() * 9000)
  )}`;
}
function daysAgo(d: number) {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString();
}

let _id = 0;
function nid() {
  _id += 1;
  return `c${_id}`;
}

const seedRng = (() => {
  let s = 42;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
})();

function pick<T>(arr: readonly T[], r = seedRng()) {
  return arr[Math.floor(r * arr.length)];
}

export const CUSTOMERS: Customer[] = Array.from({ length: 240 }, () => {
  const r = seedRng();
  const result =
    r < 0.35
      ? "성공"
      : r < 0.55
        ? "부재중"
        : r < 0.7
          ? "재연락 예정"
          : r < 0.8
            ? "개통 완료"
            : r < 0.88
              ? "관심 없음"
              : r < 0.94
                ? "실패"
                : "번호 오류";
  const status: Status =
    result === "개통 완료"
      ? "개통 완료"
      : result === "성공"
        ? "처리중"
        : result === "재연락 예정"
          ? "재연락 필요"
          : result === "관심 없음"
            ? "거부"
            : result === "실패" || result === "번호 오류"
              ? "실패"
              : "미처리";
  const callDays = Math.floor(seedRng() * 30);
  const hasCall = seedRng() > 0.15;
  const isActivated = status === "개통 완료";
  return {
    id: nid(),
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    phone: randPhone(),
    country: pick(COUNTRIES).code,
    channel: pick(CHANNELS),
    assignedStaffId: pick(STAFF.filter((s) => s.role === "staff")).id,
    callDate: hasCall ? daysAgo(callDays).slice(0, 10) : null,
    callTime: hasCall ? `${String(9 + Math.floor(seedRng() * 9)).padStart(2, "0")}:${String(Math.floor(seedRng() * 60)).padStart(2, "0")}` : null,
    callResult: hasCall ? (result as CallResult) : null,
    status,
    planName: isActivated ? pick(PLANS) : null,
    activationDate: isActivated ? daysAgo(Math.max(0, callDays - 1)).slice(0, 10) : null,
    memo: hasCall ? (seedRng() > 0.5 ? "다음주에 다시 연락 요청" : "") : "",
    createdAt: daysAgo(callDays + 5),
    updatedAt: daysAgo(callDays),
  };
});

// 통계 헬퍼
export function computeStats(customers: Customer[] = CUSTOMERS) {
  const totalCalls = customers.filter((c) => c.callResult).length;
  const success = customers.filter((c) => c.callResult === "성공" || c.callResult === "개통 완료").length;
  const failed = customers.filter((c) => c.callResult === "실패" || c.callResult === "번호 오류").length;
  const missed = customers.filter((c) => c.callResult === "부재중").length;
  const recall = customers.filter((c) => c.status === "재연락 필요").length;
  const activated = customers.filter((c) => c.status === "개통 완료").length;
  return {
    totalCalls,
    success,
    failed,
    missed,
    recall,
    activated,
    successRate: totalCalls ? (success / totalCalls) * 100 : 0,
    activationRate: totalCalls ? (activated / totalCalls) * 100 : 0,
  };
}

export function dailyTrend() {
  const days = 14;
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const ds = date.toISOString().slice(0, 10);
    const dayCustomers = CUSTOMERS.filter((c) => c.callDate === ds);
    return {
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      calls: dayCustomers.length,
      success: dayCustomers.filter((c) => c.callResult === "성공" || c.callResult === "개통 완료").length,
      activated: dayCustomers.filter((c) => c.status === "개통 완료").length,
    };
  });
}

export function monthlyTrend() {
  return Array.from({ length: 6 }, (_, i) => {
    const m = new Date();
    m.setMonth(m.getMonth() - (5 - i));
    const base = 600 + Math.floor(Math.random() * 400);
    return {
      month: `${m.getMonth() + 1}월`,
      calls: base,
      success: Math.floor(base * 0.42),
      activated: Math.floor(base * 0.18),
    };
  });
}

export const MONTHLY_TARGET_TOTAL = STAFF.filter((s) => s.role === "staff").reduce((a, b) => a + b.monthlyTarget, 0);
