import { describe, expect, it } from "bun:test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { normalizePhone } from "../src/lib/ingestion-security";

const url = process.env.STAFF_SECURITY_TEST_DATABASE_URL;
const enabled = url?.startsWith("postgres://postgres@localhost:55432/") === true;
const suite = enabled ? describe : describe.skip;

suite("reset gate and generated phone indexes, isolated synthetic PostgreSQL", () => {
  it("blocks reset-required approved staff even with forged user metadata and restores access after trusted clear", async () => {
    if (!url || !enabled) throw new Error("Isolated database required");
    const db = postgres(url, { max: 1 });
    try {
      await db.unsafe("ALTER TABLE public.profiles ADD COLUMN phone text; ALTER TABLE public.customers ADD COLUMN phone text;");
      await db.unsafe(readFileSync(new URL("../drizzle/migrations/0011_secure_reset_and_indexed_phone_matching.sql", import.meta.url), "utf8"));
      const staff = "11111111-1111-4111-8111-111111111111";
      expect((await db`SELECT public.is_approved_staff(${staff}) AS allowed`)[0].allowed).toBe(true);
      await db`UPDATE auth.users SET raw_app_meta_data=${db.json({ must_change_password: true })}, raw_user_meta_data=${db.json({ must_change_password: false })} WHERE id=${staff}`;
      expect((await db`SELECT public.is_approved_staff(${staff}) AS allowed`)[0].allowed).toBe(false);
      await db.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub',${staff},true),set_config('request.jwt.claim.role','authenticated',true)`;
        await tx.unsafe("SET LOCAL ROLE authenticated");
        expect((await tx`SELECT id FROM customers`).length).toBe(0);
        expect((await tx`SELECT id FROM telegram_messages`).length).toBe(0);
      });
      await db`UPDATE auth.users SET raw_app_meta_data=${db.json({ must_change_password: false })} WHERE id=${staff}`;
      expect((await db`SELECT public.is_approved_staff(${staff}) AS allowed`)[0].allowed).toBe(true);
      for (const phone of ["010-1234-5678", "+82 10 1234 5678", "0082 10 1234 5678", "011-1234-5678", "", "abc"]) {
        expect((await db`SELECT public.normalized_phone_digits(${phone}) AS key`)[0].key).toBe(normalizePhone(phone));
      }
      await db`UPDATE customers SET phone='010-1234-5678'`;
      expect((await db`SELECT phone_digits FROM customers`)[0].phone_digits).toBe("01012345678");
      await db`UPDATE customers SET phone='+82 10 9999 8888'`;
      expect((await db`SELECT phone_digits FROM customers`)[0].phone_digits).toBe("01099998888");
    } finally { await db.end(); }
  });
});