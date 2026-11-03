// 한패스앱 신청자 유입 구분 — 외부 신청 API가 메모(notes)에 남기는 표시 문자열 기준.
// DB는 바꾸지 않고, 화면에서만 분류/필터링합니다.
export const NH_ALLONE_MARK = "[파트너 신청] NH 올원";
export const HANPASS_WEB_MARK = "[파트너 신청] 한패스 웹";

export type CustomerSource = "all" | "nh_allone" | "hanpass_web";

export function getCustomerSource(notes: string | null | undefined): "nh_allone" | "hanpass_web" | null {
  if (!notes) return null;
  if (notes.includes(NH_ALLONE_MARK)) return "nh_allone";
  if (notes.includes(HANPASS_WEB_MARK)) return "hanpass_web";
  return null;
}

export function sourceMark(source: Exclude<CustomerSource, "all">) {
  return source === "nh_allone" ? NH_ALLONE_MARK : HANPASS_WEB_MARK;
}

type Row = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  charge_phone?: string | null;
  country_id?: string | null;
  assigned_to?: string | null;
  status: string;
  imported_at: string;
  call_round?: number | null;
  [k: string]: unknown;
};

export type SourceFilterParams = {
  search?: string;
  countryIds?: string[];
  assignedCountry?: string; // all | __none__ | id
  staff?: string; // all | __none__ | id
  status?: string; // all | status | __call_completed__
  callRound?: "all" | "none" | "1" | "2" | "3";
  dateFromIso?: string | null;
  dateToIso?: string | null;
};

/** search_customers 와 같은 규칙을 화면에서 재현 (status 제외 여부는 includeStatus로 선택). */
export function filterSourceRows<T extends Row>(
  rows: T[],
  p: SourceFilterParams,
  staff: Array<{ id: string; display_name: string; country_id: string | null }>,
  calledIds: Set<string> | null,
  includeStatus: boolean,
): T[] {
  const q = p.search?.trim().toLowerCase() ?? "";
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const nameMatchIds = q
    ? new Set(staff.filter((s) => s.display_name?.toLowerCase().includes(q)).map((s) => s.id))
    : null;
  const callCompleted = includeStatus && p.status === "__call_completed__";
  const from = p.dateFromIso ? Date.parse(p.dateFromIso) : null;
  const to = p.dateToIso ? Date.parse(p.dateToIso) : null;
  return rows.filter((c) => {
    if (q) {
      const hit =
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.charge_phone ?? "").toLowerCase().includes(q) ||
        (!!c.assigned_to && nameMatchIds!.has(c.assigned_to));
      if (!hit) return false;
    }
    if (p.countryIds?.length && !p.countryIds.includes(c.country_id ?? "")) return false;
    if (p.staff && p.staff !== "all") {
      if (p.staff === "__none__" ? c.assigned_to != null : c.assigned_to !== p.staff) return false;
    }
    if (p.assignedCountry && p.assignedCountry !== "all") {
      const sc = c.assigned_to ? (staffById.get(c.assigned_to)?.country_id ?? null) : null;
      if (p.assignedCountry === "__none__" ? sc != null : sc !== p.assignedCountry) return false;
    }
    if (includeStatus && p.status && p.status !== "all" && !callCompleted && c.status !== p.status)
      return false;
    if (!callCompleted) {
      const t = Date.parse(c.imported_at);
      if (from != null && t < from) return false;
      if (to != null && t > to) return false;
    } else if (!calledIds?.has(c.id)) return false;
    if (p.callRound && p.callRound !== "all") {
      if (p.callRound === "none" ? c.call_round != null : c.call_round !== Number(p.callRound))
        return false;
    }
    return true;
  });
}

/** ORDER BY key dir NULLS LAST, id */
export function sortSourceRows<T extends Row>(rows: T[], key: string, dir: "asc" | "desc"): T[] {
  return rows.slice().sort((a, b) => {
    const av = a[key] as string | number | null | undefined;
    const bv = b[key] as string | number | null | undefined;
    const an = av == null;
    const bn = bv == null;
    if (an !== bn) return an ? 1 : -1;
    if (!an && av !== bv) {
      const r = av! < bv! ? -1 : 1;
      return dir === "asc" ? r : -r;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
