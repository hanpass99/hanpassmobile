import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { z } from "zod";

function fixture(options: { legacy?: boolean; sendError?: string; completed?: boolean; checkpointError?: boolean; empty?: boolean } = {}) {
  const state = { lock: false, cursor: null as string | null, success: 27, failed: 3, calls: 0, optedOut: false, limits: [] as number[] };
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "has_role") return { data: true, error: null };
      if (name === "claim_broadcast_delivery") {
        if (options.legacy || state.lock) return { data: null, error: { message: "unsafe_resume" } };
        state.lock = !options.completed;
        return { data: { message: "fixture", lang_filter: "uz", delivery_cursor: state.cursor, success_count: state.success, failed_count: state.failed, status: options.completed ? "completed" : "sending" }, error: null };
      }
      if (options.checkpointError) return { error: { message: "write_failed" } };
      state.success += Number(args.sent);
      state.failed += Number(args.failed);
      state.cursor = args.cursor_id as string | null;
      state.lock = false;
      return { error: null };
    },
    from() {
      const builder = {
        select() { return builder; }, eq() { return builder; }, gt() { return builder; }, order() { return builder; },
        limit(n: number) { state.limits.push(n); return Promise.resolve({ data: options.empty || state.cursor ? [] : [{ id: "recipient-1", chat_id: 1, language: "uz" }], error: null }); },
        update() { state.optedOut = true; return { eq: async () => ({ error: null }) }; },
      };
      return builder;
    },
  };
  const telegram = {
    BOT_COPY: { broadcastFooter: { uz: "", ru: "" } }, unsubscribeMarkup: () => ({}),
    sendTelegramMessage: async (...args: unknown[]) => {
      state.calls++;
      expect(args[4]).toBeInstanceOf(AbortSignal);
      if (options.sendError) throw new Error(options.sendError);
    },
  };
  const source = readFileSync(new URL("../src/lib/broadcast.functions.ts", import.meta.url), "utf8")
    .replace(/^import[^\n]+\n/gm, "")
    .replaceAll("export const ", "const ")
    .replace(/await import\(\s*"@\/lib\/telegram.server"\s*\)/g, "telegram");
  const createServerFn = () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
    return builder;
  };
  const handler = new Function("createServerFn", "z", "requireSupabaseAuth", "telegram", new Bun.Transpiler({ loader: "ts" }).transformSync(source) + "\nreturn sendBroadcastBatch;")(createServerFn, z, {}, telegram);
  return { state, run: () => handler({ data: { broadcastId: "fixture" }, context: { supabase: client, userId: "admin" } }) };
}

describe("broadcast checkpoint delivery", () => {
  it("sends one recipient, saves progress, and resumes without resending", async () => {
    const f = fixture();
    expect(await f.run()).toEqual({ done: false, totalSuccess: 28, totalFailed: 3 });
    expect(f.state.cursor).toBe("recipient-1");
    expect(await f.run()).toEqual({ done: true, totalSuccess: 28, totalFailed: 3 });
    expect(f.state.calls).toBe(1);
    expect(f.state.limits).toEqual([1, 1]);
  });
  it("does not resend an old campaign without recipient checkpoints", async () => {
    const f = fixture({ legacy: true });
    await expect(f.run()).rejects.toThrow("unsafe_resume");
    expect(f.state.calls).toBe(0);
  });
  it("never sends again after completion", async () => {
    const f = fixture({ completed: true });
    expect((await f.run()).done).toBe(true);
    expect(f.state.calls).toBe(0);
  });
  it("keeps uncertain delivery locked and does not opt out or resend", async () => {
    const f = fixture({ sendError: "TimeoutError" });
    await expect(f.run()).rejects.toThrow("broadcast_delivery_uncertain");
    await expect(f.run()).rejects.toThrow("unsafe_resume");
    expect(f.state.calls).toBe(1);
    expect(f.state.optedOut).toBe(false);
    expect(f.state.cursor).toBeNull();
  });
  it("counts a confirmed block and moves past it", async () => {
    const f = fixture({ sendError: "Telegram sendMessage failed [403]: blocked" });
    expect(await f.run()).toEqual({ done: false, totalSuccess: 27, totalFailed: 4 });
    expect(f.state.optedOut).toBe(true);
    expect(f.state.cursor).toBe("recipient-1");
  });
  it("rate limits keep recipient eligibility and cursor unchanged", async () => {
    const f = fixture({ sendError: "Telegram sendMessage failed [429]: retry later" });
    await expect(f.run()).rejects.toThrow("broadcast_rate_limited");
    expect(f.state.optedOut).toBe(false);
    expect(f.state.cursor).toBeNull();
    expect(f.state.failed).toBe(3);
    expect(f.state.lock).toBe(false);
  });
  it("a failed checkpoint never reports successful progress", async () => {
    const f = fixture({ checkpointError: true });
    await expect(f.run()).rejects.toThrow("write_failed");
    expect(f.state.lock).toBe(true);
    expect(f.state.success).toBe(27);
  });
});