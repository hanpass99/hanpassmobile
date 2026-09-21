/**
 * Partner application API — pure, dependency-free logic.
 *
 * This module contains ONLY validation, normalization and hashing.
 * It performs no database access and reads no secrets, so it can be
 * unit-tested in isolation and imported from both server routes and tests.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Supported UI locales (14) — matches the partner application site. */
export const SUPPORTED_LOCALES = [
  "ko",
  "en",
  "zh",
  "vi",
  "ru",
  "ne",
  "km",
  "id",
  "my",
  "th",
  "mn",
  "si",
  "ja",
  "lo",
] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Allowed traffic sources. */
export const SUPPORTED_SOURCES = ["nh_allone", "hanpass_web"] as const;
export type Source = (typeof SUPPORTED_SOURCES)[number];

/** Maximum accepted request body size in bytes. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Money upper bound (KRW). Guards against absurd/overflow values. */
export const MAX_MONEY = 100_000_000;

/* ------------------------------------------------------------------ */
/* Request schema (camelCase contract)                                 */
/* ------------------------------------------------------------------ */

/**
 * Money field: integer KRW, or null.
 * `null` = not applicable / not provided. `0` = genuinely free.
 * These are deliberately NOT collapsed into each other.
 */
const money = z
  .number()
  .int("must be an integer amount")
  .min(0)
  .max(MAX_MONEY)
  .nullable();

const isoDateTime = z
  .string()
  .min(10)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO-8601 datetime");

export const applicantSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  middleName: z.string().trim().max(60).nullable().optional().default(null),
  /**
   * null / omitted is allowed: the partner site collects a single given name
   * for applicants who have no family name on their ARC. `firstName` alone is
   * then the full name.
   */
  lastName: z.string().trim().max(60).nullable().optional().default(null),

  phone: z.string().trim().min(6).max(32),
  /** ISO 3166-1 alpha-2, uppercase (MN, VN, KR, ...). */
  nationality: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "must be ISO 3166-1 alpha-2 (e.g. MN, VN)"),
});

export const productSchema = z
  .object({
    /** Partner-side product code, e.g. sk-light49 / lg-hanpass7 / bundle-a175. */
    code: z.string().trim().min(1).max(64),
    type: z.enum(["sim", "bundle"]),
    name: z.string().trim().min(1).max(120),
    /** null is allowed for a bundle whose carrier is not decided yet. */
    carrier: z.string().trim().min(1).max(40).nullable().optional().default(null),
    monthlyFee: money,
    deviceModel: z.string().trim().max(120).nullable().optional().default(null),
    devicePrice: money.optional().default(null),
    contractMonths: z.number().int().min(0).max(60).nullable().optional().default(null),
    bundledPlanCode: z.string().trim().max(64).nullable().optional().default(null),
    currency: z.literal("KRW"),
  })
  .superRefine((p, ctx) => {
    if (p.type === "sim") {
      if (p.deviceModel !== null || p.devicePrice !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["type"],
          message: "sim products must not carry device fields",
        });
      }
      if (p.carrier === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["carrier"],
          message: "sim products require a carrier",
        });
      }
      if (p.monthlyFee === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["monthlyFee"],
          message: "sim products require a monthly fee",
        });
      }
    }
  });

export const consentSchema = z.object({
  accepted: z.literal(true, {
    errorMap: () => ({ message: "consent must be accepted" }),
  }),
  version: z.string().trim().min(1).max(40),
  acceptedAt: isoDateTime,
});

/** Railway-issued UUID v4 (lowercase or uppercase), nothing else. */
export const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value.trim());
}

export const applicationRequestSchema = z.object({
  externalApplicationId: z
    .string()
    .trim()
    .refine(isUuidV4, "must be a Railway-issued UUID v4"),
  source: z.enum(SUPPORTED_SOURCES),
  locale: z.enum(SUPPORTED_LOCALES),
  applicant: applicantSchema,
  product: productSchema,
  consent: consentSchema,
  submittedAt: isoDateTime,
});



export type ApplicationRequest = z.infer<typeof applicationRequestSchema>;

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

/**
 * Normalize a phone number to the back-office display format (010-0000-0000).
 * Returns null when the value is not a recognizable Korean mobile number.
 *
 * Uses the same digit rules as the existing Google Form sync, and additionally
 * folds +82 / 0082 forms into the national 010 form so that a partner
 * application and a sheet import of the same number compare equal.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").toString().replace(/\D/g, "");
  // +82 / 0082 country code -> national form with a leading 0
  let d = digits;
  if (d.startsWith("0082")) d = d.slice(4);
  if (d.length === 13 && d.startsWith("82010")) d = d.slice(2);
  else if (d.length === 12 && d.startsWith("8210")) d = `0${d.slice(2)}`;
  if (d.length === 11 && d.startsWith("010")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  return null;
}

/** Full display name from the camelCase applicant parts. */
export function buildFullName(a: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  return [a.lastName, a.middleName, a.firstName]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comparison key for a name: case-folded, whitespace-collapsed, punctuation
 * removed. Used only for exact-match customer lookup, never for storage.
 */
export function normalizeNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.'`\-_,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Canonicalization + hashing                                          */
/* ------------------------------------------------------------------ */

/** Deterministic JSON with recursively sorted object keys. */
export function canonicalize(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = walk((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/**
 * SHA-256 of the canonicalized, validated payload.
 * Stored instead of the raw request body — no request payload is persisted.
 */
export async function requestHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------------------ */
/* Product snapshot                                                    */
/* ------------------------------------------------------------------ */

/**
 * Per-application product snapshot. Prices come from the partner's own
 * product ledger (Railway) and are stored verbatim — this back office keeps
 * no product master and performs no price lookup.
 */
export function buildProductSnapshot(req: ApplicationRequest) {
  const p = req.product;
  return {
    code: p.code,
    type: p.type,
    name: p.name,
    carrier: p.carrier,
    monthlyFee: p.monthlyFee,
    deviceModel: p.deviceModel ?? null,
    devicePrice: p.devicePrice ?? null,
    contractMonths: p.contractMonths ?? null,
    bundledPlanCode: p.bundledPlanCode ?? null,
    currency: p.currency,
  };
}

/*
 * No applicant snapshot is kept in this back office. The application ledger,
 * the original payload and every failed/needs-review case live exclusively in
 * the partner's own encrypted store (Railway). `public.customers` only ever
 * receives the operational copy of a NEW application.
 */



/** Result of reading a request body under a hard byte cap. */
export type LimitedBody =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" };

/**
 * Read a request body as UTF-8 text, aborting as soon as more than `max`
 * bytes have arrived. The stream is cancelled instead of buffering the whole
 * payload first, so an oversized body is never fully loaded into memory.
 */
export async function readLimitedText(request: Request, max = MAX_BODY_BYTES): Promise<LimitedBody> {
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > max) return { ok: false, reason: "too_large" };

  const body = request.body;
  if (!body) return { ok: true, text: "" };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let seen = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      if (seen > max) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock?.();
  }
  chunks.push(decoder.decode());
  return { ok: true, text: chunks.join("") };
}

/** True when the Content-Type declares a JSON body. */
export function isJsonContentType(header: string | null): boolean {
  const v = (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return v === "application/json";
}



/* ------------------------------------------------------------------ */
/* Timing-safe comparison + partner resolution                         */
/* ------------------------------------------------------------------ */

/** Constant-time string comparison (no early return on mismatch). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Resolve a partner id from a presented API key.
 *
 * `spec` format: "partnerId:key,partnerId:key" (read from the server
 * environment only). Returns null when the key matches nothing; never
 * reveals which partner was attempted.
 */
export function resolvePartnerId(spec: string | undefined, presented: string | null): string | null {
  if (!spec || !presented) return null;
  let matched: string | null = null;
  for (const entry of spec.split(",")) {
    const idx = entry.indexOf(":");
    if (idx <= 0) continue;
    const partnerId = entry.slice(0, idx).trim();
    const key = entry.slice(idx + 1).trim();
    if (!partnerId || !key) continue;
    if (timingSafeEqualStr(key, presented)) matched = partnerId;
  }
  return matched;
}

/** The integration is fail-closed: it runs only on an exact "true". */
export function integrationEnabled(flag: string | undefined): boolean {
  return flag === "true";
}

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

export type ApplicationResult = "created" | "replayed";

export interface ApplicationResponse {
  applicationId: string;
  externalApplicationId: string;
  result: ApplicationResult;
  status: string;
  receivedAt: string;
  requestId: string;
}

export interface StatusResponse {
  applicationId: string;
  externalApplicationId: string;
  status: string;
  receivedAt: string;
  requestId: string;
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/**
 * Flatten Zod issues into a PII-free field/message list.
 * Only paths and rule messages are emitted — never submitted values.
 */
export function safeIssues(err: z.ZodError): Array<{ field: string; message: string }> {
  return err.issues.slice(0, 20).map((i) => ({
    field: i.path.join(".") || "(root)",
    message: i.message,
  }));
}

/* ------------------------------------------------------------------ */
/* Deterministic customer id (UUID v8)                                 */
/* ------------------------------------------------------------------ */

/**
 * Domain separator for the derived id. Changing this string changes every
 * derived id, so it is frozen for contract version 1.
 */
export const CUSTOMER_ID_DOMAIN = "hanpass-partner-application-v1\u0000";

/**
 * Derive the customers.id for a partner application.
 *
 * id = UUIDv8(first 16 bytes of SHA-256(domain + partnerId + "\0" + externalApplicationId))
 *
 * Properties this relies on:
 *  - Stable across API key rotation: only the partner id and the partner's own
 *    external application id feed the hash, never the API key.
 *  - Space-separated from every other row: the value is not guessable without
 *    knowing both inputs, and it is re-derived server-side on every call, so a
 *    caller can never present an arbitrary customer id.
 */
export async function deriveCustomerId(
  partnerId: string,
  externalApplicationId: string
): Promise<string> {
  const input = `${CUSTOMER_ID_DOMAIN}${partnerId}\u0000${externalApplicationId}`;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  );
  const b = digest.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x80; // version 8
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ------------------------------------------------------------------ */
/* Machine marker stored on the first line of customers.notes          */
/* ------------------------------------------------------------------ */

export const MARKER_PREFIX = "HANPASS_PARTNER_V1:";

export interface MarkerPayload {
  partnerId: string;
  externalApplicationId: string;
  idempotencyKey: string;
  requestHash: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** `HANPASS_PARTNER_V1:<base64url(canonical JSON)>` — one line, no spaces. */
export function encodeMarker(payload: MarkerPayload): string {
  return `${MARKER_PREFIX}${toBase64Url(canonicalize(payload))}`;
}

/**
 * Strict parse of the FIRST line of a notes field. Anything else — a missing
 * prefix, damaged base64, non-object JSON, a missing field — returns null and
 * the caller must refuse. The marker is never repaired or rewritten.
 */
export function parseMarker(notes: string | null | undefined): MarkerPayload | null {
  const firstLine = (notes ?? "").split("\n", 1)[0] ?? "";
  if (!firstLine.startsWith(MARKER_PREFIX)) return null;
  const decoded = fromBase64Url(firstLine.slice(MARKER_PREFIX.length).trim());
  if (!decoded) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const fields = ["partnerId", "externalApplicationId", "idempotencyKey", "requestHash"] as const;
  for (const f of fields) {
    if (typeof o[f] !== "string" || (o[f] as string).length === 0) return null;
  }
  return {
    partnerId: o.partnerId as string,
    externalApplicationId: o.externalApplicationId as string,
    idempotencyKey: o.idempotencyKey as string,
    requestHash: o.requestHash as string,
  };
}

/**
 * Extra integrity check — NOT an authentication mechanism. Authentication is
 * the API key; this only confirms that the row found at the derived id really
 * is this partner's application and carries the same content hash.
 */
export function markerMatches(found: MarkerPayload | null, expected: MarkerPayload): boolean {
  if (!found) return false;
  return (
    timingSafeEqualStr(found.partnerId, expected.partnerId) &&
    timingSafeEqualStr(found.externalApplicationId, expected.externalApplicationId) &&
    timingSafeEqualStr(found.idempotencyKey, expected.idempotencyKey) &&
    timingSafeEqualStr(found.requestHash, expected.requestHash)
  );
}

/** GET cannot know the body hash, so only the external scope is verified. */
export function markerScopeMatches(
  found: MarkerPayload | null,
  partnerId: string,
  externalApplicationId: string
): boolean {
  if (!found) return false;
  return (
    timingSafeEqualStr(found.partnerId, partnerId) &&
    timingSafeEqualStr(found.externalApplicationId, externalApplicationId) &&
    timingSafeEqualStr(found.idempotencyKey, externalApplicationId)
  );
}

/* ------------------------------------------------------------------ */
/* Request hash normalization (frozen definition)                      */
/* ------------------------------------------------------------------ */

/**
 * The hashed value is the VALIDATED request after normalization, never the raw
 * body. Definition (frozen for v1): schema-parsed request with all optional
 * fields defaulted, the applicant phone replaced by its normalized form, and
 * object keys sorted recursively by `canonicalize`. Whitespace, key order and
 * phone formatting therefore never change the hash.
 */
export function buildHashPayload(req: ApplicationRequest, normalizedPhone: string) {
  return {
    externalApplicationId: req.externalApplicationId,
    source: req.source,
    locale: req.locale,
    applicant: {
      firstName: req.applicant.firstName,
      middleName: req.applicant.middleName ?? null,
      lastName: req.applicant.lastName,
      phone: normalizedPhone,
      nationality: req.applicant.nationality,
    },
    product: buildProductSnapshot(req),
    consent: {
      version: req.consent.version,
      acceptedAt: new Date(req.consent.acceptedAt).toISOString(),
    },
    submittedAt: new Date(req.submittedAt).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Operational copy helpers                                            */
/* ------------------------------------------------------------------ */

/** "Other / not listed" nationality — never guessed into a country code. */
export const UNKNOWN_NATIONALITY = "ZZ";

/** Calendar date of an instant in Korea Standard Time (UTC+9), as YYYY-MM-DD. */
export function kstDate(iso: string): string {
  const ms = Date.parse(iso);
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const LOCALE_LABEL: Record<Locale, string> = {
  ko: "한국어",
  en: "영어",
  zh: "중국어",
  vi: "베트남어",
  ru: "러시아어",
  ne: "네팔어",
  km: "캄보디아어",
  id: "인도네시아어",
  my: "미얀마어",
  th: "태국어",
  mn: "몽골어",
  si: "싱할라어",
  ja: "일본어",
  lo: "라오어",
};

const SOURCE_LABEL: Record<Source, string> = {
  nh_allone: "NH 올원",
  hanpass_web: "한패스 웹",
};

const wonText = (v: number | null | undefined) =>
  v === null || v === undefined ? "미정" : `${v.toLocaleString("ko-KR")}원`;

/**
 * Build the notes value: one strict machine line, then plain Korean lines an
 * operator can read in the existing 개통 신청자 list. No extra personal data.
 */
export function buildNotes(req: ApplicationRequest, marker: string): string {
  const p = req.product;
  const lines = [
    marker,
    `[파트너 신청] ${SOURCE_LABEL[req.source]} · 신청언어 ${LOCALE_LABEL[req.locale]}`,
    `상품코드 ${p.code} (${p.type === "sim" ? "유심" : "묶음"})`,
    `상품명 ${p.name}`,
    `통신사 ${p.carrier ?? "미정"} · 월요금 ${wonText(p.monthlyFee)}`,
  ];
  if (p.type === "bundle") {
    lines.push(
      `단말기 ${p.deviceModel ?? "미정"} · 단말기 가격 ${p.devicePrice === 0 ? "0원 (무료)" : wonText(p.devicePrice)}`
    );
    lines.push(`결합 요금제 ${p.bundledPlanCode ?? "미정"}`);
  }
  lines.push(`약정 ${p.contractMonths === null ? "미정" : `${p.contractMonths}개월`}`);
  lines.push(`동의 ${req.consent.version} · ${req.consent.acceptedAt}`);
  lines.push(`국적 ${req.applicant.nationality}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Status mapping                                                      */
/* ------------------------------------------------------------------ */

export type PartnerStatus =
  | "received"
  | "in_progress"
  | "activated"
  | "rejected"
  | "cancelled"
  | "unknown";

/**
 * Explicit map from the back-office customer_status enum to the partner-facing
 * status. Anything not listed is reported as "unknown" — never disguised as
 * "received", because that would claim a state the row is not in.
 */
const STATUS_MAP: Record<string, PartnerStatus> = {
  new: "received",
  in_progress: "in_progress",
  no_answer: "in_progress",
  callback: "in_progress",
  certificate_issuing: "in_progress",
  activated: "activated",
  contract_active: "activated",
  rejected: "rejected",
  not_interested: "rejected",
  wrong_application: "rejected",
  minor: "rejected",
  line_exceeded: "rejected",
  delinquent: "rejected",
  stay_expired: "cancelled",
  suspended_number: "cancelled",
};

export function mapCustomerStatus(status: string | null | undefined): PartnerStatus {
  return STATUS_MAP[(status ?? "").trim()] ?? "unknown";
}
