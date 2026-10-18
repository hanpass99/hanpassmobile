import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { constantTimeTokenEqual, normalizePhone, uniquePhoneMatch } from "../src/lib/ingestion-security";

function compileRoute(path: string, names: string[], values: unknown[]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
    .replace("export const Route =", "const Route =")
    .replace('await import("@/integrations/supabase/client.server")', '({ supabaseAdmin: fixtureAdmin })');
  return new Function("createFileRoute", ...names, new Bun.Transpiler({ loader: "ts" }).transformSync(source) + "\nreturn Route.server.handlers.POST;")(
    () => (config: unknown) => config, ...values,
  );
}

describe("password replacement handler", () => {
  it("verifies the session and clears trusted flags only in a successful password update", async () => {
    const calls: unknown[] = [];
    const auth = { auth: { getUser: async () => ({ data: { user: { id: "fixture-user", app_metadata: { must_change_password: true, created_by_admin: true }, user_metadata: { display_name: "Fixture" } } }, error: null }) } };
    let fail = false;
    const admin = { auth: { admin: { updateUserById: async (id: string, attributes: unknown) => { calls.push({ id, attributes }); return { error: fail ? { message: "fixture" } : null }; } } } };
    const handler = compileRoute("../src/routes/api/public/change-password.ts", ["z", "createClient", "fixtureAdmin", "process"], [z, () => auth, admin, { env: { SUPABASE_URL: "https://fixture.invalid", SUPABASE_PUBLISHABLE_KEY: "fixture" } }]);
    const request = () => new Request("https://fixture.invalid", { method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" }, body: JSON.stringify({ password: "new-fixture-password" }) });
    expect((await handler({ request: new Request("https://fixture.invalid", { method: "POST" }) })).status).toBe(401);
    expect(calls).toEqual([]);
    expect((await handler({ request: request() })).status).toBe(200);
    expect(calls[0]).toEqual({ id: "fixture-user", attributes: { password: "new-fixture-password", app_metadata: { must_change_password: false, created_by_admin: true }, user_metadata: { display_name: "Fixture", must_change_password: false } } });
    fail = true;
    expect((await handler({ request: request() })).status).toBe(400);
    expect(calls.length).toBe(2); // No separate flag-clearing call can run after failure.
  });
});

it("call ingestion leaves multiple exact customer matches null and records ambiguous_customer", async () => {
  const inserts: Record<string, any> = {};
  const filters: unknown[] = [];
  const admin = { from(table: string) {
    const builder: any = {
      select() { return builder; },
      eq(column: string, value: string) { filters.push({ table, column, value }); return builder; },
      limit(n: number) { expect(n).toBe(2); return Promise.resolve({ data: table === "profiles" ? [{ id: "staff" }] : [{ id: "customer-a" }, { id: "customer-b" }], error: null }); },
      insert(row: unknown) { inserts[table] = row; return builder; },
      maybeSingle: async () => ({ data: { id: "fixture-log" }, error: null }),
    };
    return builder;
  } };
  const handler = compileRoute("../src/routes/api/public/call-log.ts", ["z", "fixtureAdmin", "process", "constantTimeTokenEqual", "normalizePhone", "uniquePhoneMatch"], [z, admin, { env: { AUTOMATE_WEBHOOK_TOKEN: "fixture-token" } }, constantTimeTokenEqual, normalizePhone, uniquePhoneMatch]);
  const response = await handler({ request: new Request("https://fixture.invalid", { method: "POST", headers: { "x-automate-token": "fixture-token", "Content-Type": "application/json" }, body: JSON.stringify({ employee_phone: "+82 10 1111 2222", customer_phone: "010-1234-5678", direction: "out", started_at: "2026-10-18T00:00:00Z" }) }) });
  expect(response.status).toBe(200);
  expect(inserts.phone_call_logs.customer_id).toBeNull();
  expect(inserts.call_log_ingest.error_reason).toBe("ambiguous_customer");
  expect(inserts.call_log_ingest.matched_customer_id).toBeNull();
  expect(filters).toEqual([{ table: "profiles", column: "phone_digits", value: "01011112222" }, { table: "customers", column: "phone_digits", value: "01012345678" }]);
});