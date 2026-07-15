import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_SPREADSHEET_ID = "1EO-U_KC27ZTYT74R5q7sODVysiv9gyfgajDskLtX3fU";
const INTER_SPREADSHEET_ID = "1edZ1wlgbvbB6rVq5hoCSyfCTuIsHc3j2eKC3jFwl2DM";
const SHEET_NAME = "설문지 응답 시트1";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

// Country string (from form) → country code in our DB
// Uzbekistan은 DB에 UZ 없음 → CIS(독립국가연합)로 매핑
const COUNTRY_MAP: Record<string, string> = {
  VIETNAM: "VN", VN: "VN", "VIET NAM": "VN",
  MONGOLIA: "MN", MN: "MN",
  PHILIPPINES: "PH", PH: "PH", PHILIPPINE: "PH",
  UZBEKISTAN: "CIS", UZ: "CIS", UZB: "CIS",
  KAZAKHSTAN: "CIS", KZ: "CIS",
  KYRGYZSTAN: "CIS", KG: "CIS",
  TAJIKISTAN: "CIS", TJ: "CIS",
  RUSSIA: "CIS", RU: "CIS",
  CHINA: "CN", CN: "CN",
  NEPAL: "NP", NP: "NP",
  CAMBODIA: "KH", KH: "KH",
  THAILAND: "TH", TH: "TH",
  INDONESIA: "ID", ID: "ID",
  INDIA: "IN", IN: "IN",
  MYANMAR: "MM", MM: "MM",
  "SRI LANKA": "LK", LK: "LK",
  BANGLADESH: "BD", BD: "BD",
  PAKISTAN: "PK", PK: "PK",
  GHANA: "GH", GH: "GH",
  EGYPT: "EG", EG: "EG",
  JORDAN: "JO", JO: "JO",
  USA: "US", US: "US", "UNITED STATES": "US",
  CANADA: "CA", CA: "CA",
  UK: "GB", GB: "GB", ENGLAND: "GB", "UNITED KINGDOM": "GB",
};

function mapCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  return COUNTRY_MAP[key] ?? null;
}

// 유효 전화번호만 통과 + 자동 하이픈 포맷.
// - 010XXXXXXXX (11자리) → 010-XXXX-XXXX
// - 8210XXXXXXXX (12자리, +82 10) → 8210-XXXX-XXXX
// 그 외는 null 반환 → 스킵.
function normalizePhone(raw: string): string | null {
  const digits = (raw || "").toString().replace(/\D/g, "");
  const normalizedDigits =
    digits.length === 13 && digits.startsWith("82010")
      ? `8210${digits.slice(5)}`
      : digits;
  if (normalizedDigits.length === 11 && normalizedDigits.startsWith("010")) {
    return `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`;
  }
  if (normalizedDigits.length === 12 && normalizedDigits.startsWith("8210")) {
    return `${normalizedDigits.slice(0, 4)}-${normalizedDigits.slice(4, 8)}-${normalizedDigits.slice(8)}`;
  }
  return null;
}

type SyncResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

export const syncGoogleFormApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!lovableKey || !sheetsKey) {
      throw new Error("Google Sheets 커넥터가 연결되지 않았습니다.");
    }

    const range = `'${SHEET_NAME}'!A2:D`;
    const url = `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${range}`;

    // 429/5xx 재시도 (지수 백오프). Google Sheets 분당 쿼터 초과 시 잠깐 대기 후 재시도.
    let res: Response | null = null;
    let lastBody = "";
    const delays = [1000, 3000, 7000]; // 최대 3회 재시도
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": sheetsKey,
        },
      });
      if (res.ok) break;
      lastBody = await res.text();
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt === delays.length) {
        if (res.status === 429) {
          throw new Error(
            "구글 시트 분당 요청 한도(1,500/min)를 초과했습니다. 1~2분 후 다시 시도해 주세요.",
          );
        }
        throw new Error(`Google Sheets 요청 실패 [${res.status}]: ${lastBody}`);
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
    if (!res || !res.ok) {
      throw new Error(`Google Sheets 요청 실패: ${lastBody}`);
    }

    const data = (await res.json()) as { values?: string[][] };
    const rows = (data.values ?? []).filter((r) => r && (r[0] || r[1] || r[2]));

    // Use admin client for writes so DB triggers don't auto-assign the customer
    // to the currently signed-in staff (구글폼 신규 유입은 미배정으로 두어야 함).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 기존 응답 로드 (dedupe key)
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("google_form_submissions")
      .select("timestamp_raw, name, phone");
    if (exErr) throw exErr;
    const existingKeys = new Set(
      (existing ?? [])
        .map((r) => {
          const normalized = normalizePhone(r.phone ?? "");
          return normalized ? `${r.timestamp_raw}|${r.name}|${normalized}` : null;
        })
        .filter((key): key is string => Boolean(key)),
    );

    // 기존 고객(name+phone) 로드 → 중복 방지 (submissions 기록이 유실된 경우 대비)
    const { data: existingCust, error: ecErr } = await supabaseAdmin
      .from("customers")
      .select("name, phone")
      .eq("pool", "google_form_activation");
    if (ecErr) throw ecErr;
    const existingCustKeys = new Set(
      (existingCust ?? [])
        .map((r) => {
          const normalized = normalizePhone(r.phone ?? "");
          return normalized ? `${r.name}|${normalized}` : null;
        })
        .filter((key): key is string => Boolean(key)),
    );


    // 국가 매핑
    const { data: countries, error: coErr } = await supabaseAdmin
      .from("countries")
      .select("id, code");
    if (coErr) throw coErr;
    const codeToId = new Map((countries ?? []).map((c) => [c.code, c.id]));

    const result: SyncResult = { fetched: rows.length, inserted: 0, skipped: 0, errors: [] };
    const today = new Date().toISOString().slice(0, 10);

    for (const row of rows) {
      const timestamp_raw = (row[0] ?? "").toString().trim();
      const name = (row[1] ?? "").toString().trim();
      const phone = normalizePhone(row[2] ?? "");
      const country_raw = (row[3] ?? "").toString().trim();

      if (!name || !phone) {
        result.skipped++;
        continue;
      }
      const key = `${timestamp_raw}|${name}|${phone}`;
      if (existingKeys.has(key)) {
        result.skipped++;
        continue;
      }
      const custKey = `${name}|${phone}`;
      if (existingCustKeys.has(custKey)) {
        result.skipped++;
        continue;
      }
      existingCustKeys.add(custKey);



      const code = mapCountry(country_raw);
      const country_id = code ? codeToId.get(code) ?? null : null;

      // customers insert (부분 유니크 인덱스는 upsert onConflict가 매치되지 않아 plain insert 사용)
      const { data: cust, error: custErr } = await supabaseAdmin
        .from("customers")
        .insert({
          name,
          phone,
          country_id,
          signup_date: today,
          application_date: today,
          status: "new",
          assigned_to: null,
          pool: "google_form_activation",
          notes: "구글폼 자동 등록",
        })
        .select("id")
        .maybeSingle();

      let customerId = cust?.id ?? null;
      if (custErr) {
        const code = (custErr as { code?: string }).code;
        const msg = (custErr.message ?? "").toLowerCase();
        const isDuplicate =
          code === "23505" ||
          msg.includes("duplicate key") ||
          msg.includes("customers_google_form_dedup");
        if (isDuplicate) {
          // 기존 고객 재조회 (있으면 submission만 기록, 없어도 조용히 스킵)
          const { data: existingRow } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("pool", "google_form_activation")
            .eq("name", name)
            .eq("phone", phone)
            .maybeSingle();
          customerId = existingRow?.id ?? null;
          if (!customerId) {
            existingKeys.add(key);
            result.skipped++;
            continue;
          }
        } else {
          result.errors.push(`${name}: ${custErr.message}`);
          continue;
        }
      }
      if (!customerId) {
        result.skipped++;
        continue;
      }

      const { error: subErr } = await supabaseAdmin
        .from("google_form_submissions")
        .insert({
          timestamp_raw,
          name,
          phone,
          country_raw,
          country_id,
          customer_id: customerId,
        });


      if (subErr) {
        if ((subErr as { code?: string }).code === "23505") {
          existingKeys.add(key);
          result.skipped++;
          continue;
        }
        result.errors.push(`${name} (기록): ${subErr.message}`);
        continue;
      }

      existingKeys.add(key);
      result.inserted++;
    }

    return result;
  });

export type GoogleFormSubmissionRow = {
  id: string;
  timestamp_raw: string;
  name: string;
  phone: string;
  country_raw: string | null;
  country_code: string | null;
  country_name_ko: string | null;
  customer_id: string | null;
  synced_at: string;
};

export const listGoogleFormApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleFormSubmissionRow[]> => {
    const { data, error } = await context.supabase
      .from("google_form_submissions")
      .select("id, timestamp_raw, name, phone, country_raw, customer_id, synced_at, countries(code, name_ko)")
      .order("synced_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      timestamp_raw: r.timestamp_raw,
      name: r.name,
      phone: r.phone,
      country_raw: r.country_raw,
      country_code: (r as any).countries?.code ?? null,
      country_name_ko: (r as any).countries?.name_ko ?? null,
      customer_id: r.customer_id,
      synced_at: r.synced_at,
    }));
  });
