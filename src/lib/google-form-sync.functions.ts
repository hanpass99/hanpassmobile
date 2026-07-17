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

type SyncConfig = {
  spreadsheetId: string;
  pool: "google_form_activation" | "google_form_activation_inter";
  source: string;
  notesLabel: string;
};

async function runSync(cfg: SyncConfig): Promise<SyncResult> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !sheetsKey) {
    throw new Error("Google Sheets 커넥터가 연결되지 않았습니다.");
  }

  const range = `'${SHEET_NAME}'!A2:D`;
  const url = `${GATEWAY_URL}/spreadsheets/${cfg.spreadsheetId}/values/${range}`;

  let res: Response | null = null;
  let lastBody = "";
  const delays = [1000, 3000, 7000];
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

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // dedupe key: submissions filtered by source so each sheet has its own log
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("google_form_submissions")
    .select("timestamp_raw, name, phone")
    .eq("source", cfg.source);
  if (exErr) throw exErr;
  const existingKeys = new Set(
    (existing ?? [])
      .map((r) => {
        const normalized = normalizePhone(r.phone ?? "");
        return normalized ? `${r.timestamp_raw}|${r.name}|${normalized}` : null;
      })
      .filter((key): key is string => Boolean(key)),
  );

  const { data: existingCust, error: ecErr } = await supabaseAdmin
    .from("customers")
    .select("name, phone")
    .eq("pool", cfg.pool);
  if (ecErr) throw ecErr;
  const existingCustKeys = new Set(
    (existingCust ?? [])
      .map((r) => {
        const normalized = normalizePhone(r.phone ?? "");
        return normalized ? `${r.name}|${normalized}` : null;
      })
      .filter((key): key is string => Boolean(key)),
  );

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
        pool: cfg.pool,
        notes: cfg.notesLabel,
      })
      .select("id")
      .maybeSingle();

    let customerId = cust?.id ?? null;
    if (custErr) {
      const code2 = (custErr as { code?: string }).code;
      const msg = (custErr.message ?? "").toLowerCase();
      const isDuplicate =
        code2 === "23505" ||
        msg.includes("duplicate key") ||
        msg.includes("customers_google_form");
      if (isDuplicate) {
        const { data: existingRow } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("pool", cfg.pool)
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
        source: cfg.source,
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
}

export const syncGoogleFormApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SyncResult> => {
    return runSync({
      spreadsheetId: DEFAULT_SPREADSHEET_ID,
      pool: "google_form_activation",
      source: "default",
      notesLabel: "구글폼 자동 등록",
    });
  });

export const syncGoogleFormApplicationsInter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SyncResult> => {
    return runSync({
      spreadsheetId: INTER_SPREADSHEET_ID,
      pool: "google_form_activation_inter",
      source: "inter",
      notesLabel: "구글폼 인터 자동 등록",
    });
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

// ============================================================
// 친구 추천 리스트 자동 동기화
// 구글 시트: 회원번호 | 이름 | 전화번호 | 국적 | 유입채널 | 가입년월 | 가입일자
// UZ/KZ/KG/TJ/RU → country_code 'CIS' 로 저장, 실제 국적은 메모에 기록
// ============================================================
const FRIEND_REFERRAL_SPREADSHEET_ID = "1OwC6pQ2as5VsyDTYVzUSGsNru9ki2jFvScn5kk2zZ1w";
const FRIEND_REFERRAL_SHEET_NAME = "시트1";

// 실제 국적 표기 (메모용)
const NATIONALITY_LABEL: Record<string, string> = {
  UZ: "우즈베키스탄 (Uzbekistan)",
  KZ: "카자흐스탄 (Kazakhstan)",
  KG: "키르기스스탄 (Kyrgyzstan)",
  TJ: "타지키스탄 (Tajikistan)",
  RU: "러시아 (Russia)",
};
const CIS_CODES = new Set(["UZ", "KZ", "KG", "TJ", "RU"]);

function normalizeFriendPhone(raw: string): string | null {
  const digits = (raw || "").toString().replace(/\D/g, "");
  if (!digits) return null;
  // 010XXXXXXXX (11자리) → 010-XXXX-XXXX
  if (digits.length === 11 && digits.startsWith("010")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  // 8210XXXXXXXX
  if (digits.length === 12 && digits.startsWith("8210")) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  // 외국 번호 등 그대로 반환
  return digits;
}

// 20260716 → 2026-07-16
function parseSheetDate(raw: string): string | null {
  const s = (raw || "").toString().replace(/\D/g, "");
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return null;
}

export const syncFriendReferrals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SyncResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!lovableKey || !sheetsKey) {
      throw new Error("Google Sheets 커넥터가 연결되지 않았습니다.");
    }

    const range = `'${FRIEND_REFERRAL_SHEET_NAME}'!A2:H`;
    const url = `${GATEWAY_URL}/spreadsheets/${FRIEND_REFERRAL_SPREADSHEET_ID}/values/${range}`;

    let res: Response | null = null;
    let lastBody = "";
    const delays = [1000, 3000, 7000];
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
          throw new Error("구글 시트 분당 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.");
        }
        throw new Error(`Google Sheets 요청 실패 [${res.status}]: ${lastBody}`);
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
    if (!res || !res.ok) throw new Error(`Google Sheets 요청 실패: ${lastBody}`);

    const data = (await res.json()) as { values?: string[][] };
    // 시트 첫 컬럼은 빈 컬럼 → B부터 데이터. A2:H 로 요청했으므로 [0]=A(빈), [1]=회원번호 ...
    const rows = (data.values ?? []).filter((r) => r && (r[1] || r[2] || r[3]));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: countries, error: coErr } = await supabaseAdmin
      .from("countries")
      .select("id, code");
    if (coErr) throw coErr;
    const codeToId = new Map((countries ?? []).map((c) => [c.code, c.id]));

    const result: SyncResult = { fetched: rows.length, inserted: 0, skipped: 0, errors: [] };
    const today = new Date().toISOString().slice(0, 10);
    const seenMemberNos = new Set<string>();

    for (const row of rows) {
      const member_no = (row[1] ?? "").toString().trim();
      const name = (row[2] ?? "").toString().trim();
      const phone = normalizeFriendPhone(row[3] ?? "");
      const country_raw = (row[4] ?? "").toString().trim().toUpperCase();
      const channel = (row[5] ?? "").toString().trim() || null;
      const signup_ym = (row[6] ?? "").toString().trim() || null;
      const signup_date = parseSheetDate(row[7] ?? "");

      if (!member_no || !name || !phone) {
        result.skipped++;
        continue;
      }
      // Skip duplicates within the same sheet fetch
      if (seenMemberNos.has(member_no)) {
        result.skipped++;
        continue;
      }
      seenMemberNos.add(member_no);

      const isCis = CIS_CODES.has(country_raw);
      const storedCode = isCis ? "CIS" : (country_raw || null);

      // 허용 국가만 저장: CIS, MM, LK, VN, BD, NP, PH, KH
      const ALLOWED = new Set(["CIS", "MM", "LK", "VN", "BD", "NP", "PH", "KH"]);
      if (!storedCode || !ALLOWED.has(storedCode)) {
        result.skipped++;
        continue;
      }
      const country_id = codeToId.get(storedCode) ?? null;

      const notes = isCis
        ? `친구 추천 자동 등록 · 실제 국적: ${NATIONALITY_LABEL[country_raw] ?? country_raw}`
        : "친구 추천 자동 등록";

      // Upsert into friend_referrals log (unique on member_no).
      const { data: frUpsert, error: frErr } = await supabaseAdmin
        .from("friend_referrals")
        .upsert(
          { member_no, name, phone, country_code: storedCode, channel, signup_ym, signup_date },
          { onConflict: "member_no", ignoreDuplicates: true },
        )
        .select("id");
      if (frErr) {
        result.errors.push(`${name}: ${frErr.message}`);
        continue;
      }
      // Already existed → nothing new to insert
      if (!frUpsert || frUpsert.length === 0) {
        result.skipped++;
        continue;
      }

      // Upsert customer (unique partial index on (name, phone) for friend_referral)
      const { data: custUpsert, error: custErr } = await supabaseAdmin
        .from("customers")
        .upsert(
          {
            name,
            phone,
            country_id,
            signup_date: signup_date ?? today,
            status: "new",
            assigned_to: null,
            pool: "friend_referral",
            notes,
          },
          { onConflict: "name,phone", ignoreDuplicates: true },
        )
        .select("id");

      if (custErr) {
        result.errors.push(`${name}: ${custErr.message}`);
        continue;
      }
      if (!custUpsert || custUpsert.length === 0) {
        result.skipped++;
        continue;
      }
      result.inserted++;
    }

    return result;
  });

