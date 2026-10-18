import { createHash, timingSafeEqual } from "node:crypto";

export function constantTimeTokenEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0082")) digits = digits.slice(4);
  if (digits.startsWith("82") && digits.length >= 11) digits = digits.slice(2);
  if (!digits.startsWith("0") && /^(1[016789]|2|3[1-3]|4[1-4]|5[1-5]|6[1-4])/.test(digits)) digits = "0" + digits;
  return digits;
}

export function uniquePhoneMatch(rows: { id: string }[] | null) {
  return { id: rows?.length === 1 ? rows[0].id : null, ambiguous: (rows?.length ?? 0) > 1 };
}

export function inboundInsertOutcome(error: { code?: string } | null): "duplicate" | "failed" | "inserted" {
  return error?.code === "23505" ? "duplicate" : error ? "failed" : "inserted";
}