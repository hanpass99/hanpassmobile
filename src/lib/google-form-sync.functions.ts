import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SPREADSHEET_ID = "1EO-U_KC27ZTYT74R5q7sODVysiv9gyfgajDskLtX3fU";
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

function normalizePhone(raw: string): string {
  return (raw || "").toString().trim();
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
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Sheets 요청 실패 [${res.status}]: ${body}`);
    }
    const data = (await res.json()) as { values?: string[][] };
    const rows = (data.values ?? []).filter((r) => r && (r[0] || r[1] || r[2]));

    const { supabase } = context;

    // 기존 응답 로드 (dedupe key)
    const { data: existing, error: exErr } = await supabase
      .from("google_form_submissions")
      .select("timestamp_raw, name, phone");
    if (exErr) throw exErr;
    const existingKeys = new Set(
      (existing ?? []).map((r) => `${r.timestamp_raw}|${r.name}|${r.phone}`),
    );

    // 기존 고객(name+phone) 로드 → 중복 방지 (submissions 기록이 유실된 경우 대비)
    const { data: existingCust, error: ecErr } = await supabase
      .from("customers")
      .select("name, phone")
      .eq("pool", "google_form_activation");
    if (ecErr) throw ecErr;
    const existingCustKeys = new Set(
      (existingCust ?? []).map((r) => `${r.name}|${r.phone}`),
    );


    // 국가 매핑
    const { data: countries, error: coErr } = await supabase
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

      // customers 삽입
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .insert({
          name,
          phone,
          country_id,
          signup_date: today,
          application_date: today,
          status: "new",
          pool: "google_form_activation",
          notes: "구글폼 자동 등록",
        })
        .select("id")
        .single();

      if (custErr) {
        result.errors.push(`${name}: ${custErr.message}`);
        continue;
      }

      const { error: subErr } = await supabase
        .from("google_form_submissions")
        .insert({
          timestamp_raw,
          name,
          phone,
          country_raw,
          country_id,
          customer_id: cust.id,
        });

      if (subErr) {
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
