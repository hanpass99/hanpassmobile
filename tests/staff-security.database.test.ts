/** Real PostgreSQL/RLS integration test against an isolated, synthetic database only.
 * STAFF_SECURITY_TEST_DATABASE_URL must point at local port 55432. Never uses the app database.
 */
import { describe, expect, it } from "bun:test";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = process.env.STAFF_SECURITY_TEST_DATABASE_URL;
const enabled = url?.startsWith("postgres://postgres@localhost:55432/") === true;
const suite = enabled ? describe : describe.skip;

suite("actual signup trigger and RLS, isolated PostgreSQL", () => {
  it("preserves approved visibility and blocks forged pending signup on all five tables", async () => {
    if (!url || !enabled) throw new Error("Local test database required");
    const db = postgres(url, { max: 1 });
    const staff = "11111111-1111-4111-8111-111111111111";
    const pending = "22222222-2222-4222-8222-222222222222";
    const country = "33333333-3333-4333-8333-333333333333";
    const tables = ["customers", "telegram_chats", "telegram_messages", "loan_borrowers", "google_form_submissions"];
    try {
      await db.unsafe(readFileSync(new URL("./fixtures/staff-security.sql", import.meta.url), "utf8"));
      await db`INSERT INTO countries(id) VALUES (${country})`;
      // First signup retains bootstrap admin semantics.
      await db`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES (${staff},'first@fixture.invalid',${db.json({ country_id: country })})`;
      await db`UPDATE user_roles SET role='staff' WHERE user_id=${staff}`;
      await db`INSERT INTO customers(id,country_id,pool) VALUES (${country},${country},'existing')`;
      for (const table of tables.slice(1)) await db.unsafe(`INSERT INTO ${table}(id) VALUES ('${country}')`);
      await db`INSERT INTO ai_reply_settings(id,enabled) VALUES (${country},true)`;
      await db`INSERT INTO storage.objects(id,bucket_id) VALUES (${country},'telegram-media')`;
      const visible = async (uid: string) => db.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub',${uid},true),set_config('request.jwt.claim.role','authenticated',true)`;
        await tx.unsafe("SET LOCAL ROLE authenticated");
        const counts: number[] = [];
        for (const table of tables) {
          const rows = await tx.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
          counts.push(rows[0]?.n);
        }
        return counts;
      });
      const before = await visible(staff);
      expect(before).toEqual([1,1,1,1,1]);
      await db.unsafe(readFileSync(new URL("../drizzle/migrations/0008_approved_staff_access_gate.sql", import.meta.url), "utf8"));
      expect(await visible(staff)).toEqual(before);
      await db`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES (${pending},'pending@fixture.invalid',${db.json({ created_by_admin: true, country_id: country })})`;
      const profile = await db`SELECT approval_status,is_active,country_id FROM profiles WHERE id=${pending}`;
      expect(profile[0]).toMatchObject({ approval_status: "pending", is_active: false, country_id: country });
      expect((await db`SELECT * FROM user_roles WHERE user_id=${pending}`).length).toBe(0);
      expect((await db`SELECT * FROM profile_countries WHERE user_id=${pending}`).length).toBe(0);
      expect(await visible(pending)).toEqual([0,0,0,0,0]);
      await db.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub',${pending},true)`;
        await tx.unsafe("SET LOCAL ROLE authenticated");
        expect((await tx`SELECT id FROM profiles`).length).toBe(1);
        expect((await tx`SELECT id FROM storage.objects`).length).toBe(0);
        expect((await tx`UPDATE profiles SET approval_status='approved',is_active=true WHERE id=${pending} RETURNING id`).length).toBe(0);
        await expect(tx`INSERT INTO storage.objects(id,bucket_id) VALUES (${pending},'telegram-media')`.execute()).rejects.toThrow();
      }).catch((error) => { if (!String(error).includes("row-level security")) throw error; });
      await db.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub',${staff},true)`;
        await tx.unsafe("SET LOCAL ROLE authenticated");
        expect((await tx`SELECT * FROM ai_reply_settings`).length).toBe(1);
        expect((await tx`UPDATE ai_reply_settings SET enabled=false RETURNING id`).length).toBe(0);
        expect((await tx`DELETE FROM ai_reply_settings RETURNING id`).length).toBe(0);
        await expect(tx`INSERT INTO ai_reply_settings(id,enabled) VALUES (${pending},true)`.execute()).rejects.toThrow();
      }).catch((error) => { if (!String(error).includes("row-level security")) throw error; });
      // Approval transaction grants the requested country, without changing existing staff.
      await db`INSERT INTO user_roles(user_id,role) VALUES (${pending},'staff')`;
      await db`UPDATE profiles SET approval_status='approved',is_active=true WHERE id=${pending}`;
      expect((await db`SELECT country_id FROM profile_countries WHERE user_id=${pending}`)[0]?.country_id).toBe(country);
      expect(await visible(pending)).toEqual([1,1,1,1,1]);
      await db`UPDATE profiles SET approval_status='disabled',is_active=false WHERE id=${pending}`;
      expect(await visible(pending)).toEqual([0,0,0,0,0]);
    } finally { await db.end(); }
  }, 30000);
});