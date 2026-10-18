import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { currentOffHoursSessionStart, sundaySessionStart, timezoneOffsetMs } from "../src/lib/telegram-sessions";
import { constantTimeTokenEqual, normalizePhone, uniquePhoneMatch, inboundInsertOutcome } from "../src/lib/ingestion-security";
import { mustChangePassword } from "../src/lib/password-change";

describe("timezone sessions", () => {
  it("starts Seoul Sunday at Saturday 15:00 UTC", () => {
    expect(sundaySessionStart("Asia/Seoul", new Date("2026-10-18T13:00:00Z")).toISOString()).toBe("2026-10-17T15:00:00.000Z");
  });
  it("starts the 19:00 KST weekday session at 10:00 UTC", () => {
    expect(currentOffHoursSessionStart("Asia/Seoul", 10, 19, new Date("2026-10-19T10:00:00Z"))?.toISOString()).toBe("2026-10-19T10:00:00.000Z");
  });
  it("uses the previous local day before opening", () => {
    expect(currentOffHoursSessionStart("Asia/Seoul", 10, 19, new Date("2026-10-19T00:00:00Z"))?.toISOString()).toBe("2026-10-18T10:00:00.000Z");
  });
  it("does not create a session during working hours", () => {
    expect(currentOffHoursSessionStart("Asia/Seoul", 10, 19, new Date("2026-10-19T01:00:00Z"))).toBeNull();
  });
  it("handles negative, half-hour and daylight offsets", () => {
    const now = new Date("2026-10-18T13:00:00.123Z");
    expect(timezoneOffsetMs("Asia/Seoul", now)).toBe(9 * 3600000);
    expect(timezoneOffsetMs("America/New_York", now)).toBe(-4 * 3600000);
    expect(timezoneOffsetMs("Asia/Kolkata", now)).toBe(5.5 * 3600000);
    expect(sundaySessionStart("America/New_York", now).toISOString()).toBe("2026-10-18T04:00:00.000Z");
  });
});

describe("exact phone matching", () => {
  it("normalizes formatted and international Korean numbers to the same full key", () => {
    for (const raw of ["010-1234-5678", "+82 10 1234 5678", "0082 10 1234 5678"]) expect(normalizePhone(raw)).toBe("01012345678");
  });
  it("does not equate numbers merely sharing the last eight digits", () => {
    expect(normalizePhone("010-1234-5678")).not.toBe(normalizePhone("011-1234-5678"));
  });
  it("leaves an ambiguous customer unlinked", () => {
    expect(uniquePhoneMatch([{ id: "a" }, { id: "b" }])).toEqual({ id: null, ambiguous: true });
  });
  it("matches only one result and leaves empty results unlinked", () => {
    expect(uniquePhoneMatch([{ id: "a" }])).toEqual({ id: "a", ambiguous: false });
    expect(uniquePhoneMatch([]).id).toBeNull();
  });
  it("accepts only equal tokens, including unequal lengths", () => {
    expect(constantTimeTokenEqual("fixture-token", "fixture-token")).toBe(true);
    expect(constantTimeTokenEqual("fixture-token", "fixture-tokeN")).toBe(false);
    expect(constantTimeTokenEqual("fixture-token", "")).toBe(false);
  });
});

it("requires a password change only for a trusted true flag", () => {
  expect(mustChangePassword({ must_change_password: true })).toBe(true);
  expect(mustChangePassword({ must_change_password: false })).toBe(false);
  expect(mustChangePassword({})).toBe(false);
});

// Execute the actual webhook with an in-memory client and fail-on-send Telegram mocks.
it("acknowledges duplicate inbound updates without any automated reply or chat update", async () => {
  const source = readFileSync(new URL("../src/routes/api/public/telegram/webhook.ts", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
    .replace('export const Route =', 'const Route =')
    .replace('await import("@/integrations/supabase/client.server")', '({ supabaseAdmin: fixtureClient })');
  const sends: string[] = [];
  let writes = 0;
  const supabaseAdmin = { from(table: string) {
    const builder: any = {
      select() { return builder; }, eq() { return builder; },
      update() { writes++; return builder; },
      insert() { return builder; },
      maybeSingle: async () => ({ data: table === "telegram_chats" ? { id: "chat-fixture", banned: false, status: "new" } : null }),
      single: async () => ({ data: null, error: { code: "23505" } }),
    };
    return builder;
  } };
  const transformed = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const failSend = () => { sends.push("reply"); throw new Error("Duplicate must never send"); };
  const names = ["createFileRoute", "deriveWebhookSecret", "safeFixture", "fixtureClient", "inboundInsertOutcome", "sendTelegramMessage", "sendLanguagePicker", "removeKeyboard", "normalizePhone", "formatKoreanPhone"];
  const handler = new Function(...names, transformed.replace(/function safeEqual\([\s\S]*?\n\}/, "function safeEqual(a,b) { return safeFixture(a,b); }") + '\nreturn Route.server.handlers.POST;')(
    () => (config: unknown) => config, () => "fixture-secret", (a: string,b: string) => a === b, supabaseAdmin, inboundInsertOutcome, failSend, failSend, failSend, normalizePhone, (p: string) => p,
  );
  for (const input of [{ text: "/start" }, { text: "question" }, { voice: { file_id: "fixture" } }, { contact: { phone_number: "01012345678" } }, { text: "/stop" }]) {
    const request = new Request("https://fixture.invalid", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "fixture-secret" },
      body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, date: 1, ...input } }),
    });
    const response = await handler({ request });
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
  }
  expect(sends).toEqual([]);
  expect(writes).toBe(0);
});

it("generates unique 20-character temporary passwords with letters, digits and symbols", () => {
  const source = readFileSync(new URL("../supabase/functions/admin-reset-staff-password/index.ts", import.meta.url), "utf8");
  const start = source.indexOf("export function generateTemporaryPassword");
  const end = source.indexOf("\nDeno.serve", start);
  const compiled = new Bun.Transpiler({ loader: "ts" }).transformSync(source.slice(start, end).replace("export function", "function"));
  const generate = new Function("crypto", compiled + "\nreturn generateTemporaryPassword;")(crypto);
  const passwords = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const password = generate();
    expect(password.length).toBe(20);
    expect(/[a-zA-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[^a-zA-Z0-9]/.test(password)).toBe(true);
    passwords.add(password);
  }
  expect(passwords.size).toBe(100);
});