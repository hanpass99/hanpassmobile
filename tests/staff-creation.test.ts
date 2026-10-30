import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { classifyStaffCreationError } from "../src/lib/staff-creation-errors";
import { isApprovedStaff, staffBanDuration } from "../src/lib/staff-security";

function fixture(failure = "") {
  const calls: string[] = [];
  const admin = {
    auth: {
      admin: {
        createUser: async () => {
          calls.push("create");
          return {
            data: { user: failure === "duplicate" ? null : { id: "new-user" } },
            error: failure === "duplicate" ? { code: "email_exists" } : null,
          };
        },
        deleteUser: async (id: string) => {
          calls.push(`delete:${id}`);
          return { error: failure === "cleanup" ? { message: "failed" } : null };
        },
        updateUserById: async (id: string) => {
          calls.push(`ban:${id}`);
          return { error: null };
        },
      },
    },
    rpc: async () => {
      calls.push("disable");
      return { error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { approval_status: "approved", is_active: true },
            error: failure === "profile" ? { message: "failed" } : null,
          }),
        }),
      }),
    }),
  };
  const context = {
    userId: "existing-admin",
    supabase: {
      rpc: async (name: string) => {
        calls.push(name);
        return {
          data: name === "has_role" ? failure !== "forbidden" : null,
          error:
            (name === "admin_set_profile_countries" && ["country", "cleanup"].includes(failure)) ||
            (name === "admin_set_user_role" && failure === "role")
              ? { message: "failed" }
              : null,
        };
      },
    },
  };
  const source = readFileSync(
    new URL("../src/lib/staff-admin.functions.ts", import.meta.url),
    "utf8",
  )
    .replace(/^import.*\n/gm, "")
    .replaceAll("export const", "const")
    .replaceAll(
      'await import("@/integrations/supabase/client.server")',
      "({ supabaseAdmin: fixtureAdmin })",
    );
  const builder = {
    middleware: () => builder,
    inputValidator: () => builder,
    handler: (handler: unknown) => handler,
  };
  const handler = new Function(
    "createServerFn",
    "z",
    "requireSupabaseAuth",
    "isApprovedStaff",
    "staffBanDuration",
    "classifyStaffCreationError",
    "fixtureAdmin",
    new Bun.Transpiler({ loader: "ts" }).transformSync(source) + "\nreturn createStaff;",
  )(() => builder, z, {}, isApprovedStaff, staffBanDuration, classifyStaffCreationError, admin);
  return {
    calls,
    run: () =>
      handler({
        context,
        data: {
          email: "fixture@example.invalid",
          password: "fixture-only",
          display_name: "Fixture",
          company: "한패스 모바일",
          country_ids: [],
          role: "staff",
        },
      }),
  };
}

describe("staff creation", () => {
  it("does not modify an existing duplicate-email account", async () => {
    const f = fixture("duplicate");
    expect(await f.run()).toEqual({ ok: false, error: "staff_email_exists" });
    expect(f.calls).toEqual(["has_role", "create"]);
  });
  it("rejects non-admin callers before creating an account", async () => {
    const f = fixture("forbidden");
    await expect(f.run()).rejects.toThrow("forbidden");
    expect(f.calls).toEqual(["has_role"]);
  });
  for (const stage of ["country", "role", "profile"]) {
    it(`removes only the new account after ${stage} provisioning failure`, async () => {
      const f = fixture(stage);
      expect(await f.run()).toEqual({ ok: false, error: "staff_provision_failed" });
      expect(f.calls.at(-1)).toBe("delete:new-user");
      expect(f.calls).not.toContain("ban:existing-admin");
    });
  }
  it("reports unsuccessful cleanup and disables the new account", async () => {
    const f = fixture("cleanup");
    expect(await f.run()).toEqual({ ok: false, error: "staff_cleanup_failed" });
    expect(f.calls.slice(-3)).toEqual(["delete:new-user", "ban:new-user", "disable"]);
  });
  it("returns the approved newly provisioned account", async () => {
    const f = fixture();
    expect(await f.run()).toEqual({ ok: true, user_id: "new-user" });
    expect(f.calls).not.toContain("delete:new-user");
  });
  it("recognizes the hosted duplicate registration error", () => {
    expect(
      classifyStaffCreationError({
        message: "A user with this email address has already been registered",
      }),
    ).toBe("staff_email_exists");
  });
});
