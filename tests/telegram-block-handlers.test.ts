import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { isTelegramBotBlocked } from "../src/lib/telegram-delivery";
import { inboundInsertOutcome } from "../src/lib/ingestion-security";

function replyFixture(kind: "text" | "media", sendError: string | null) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    rpc: async () => ({ data: { ok: true }, error: null }),
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: (value: Record<string, unknown>) => { updates.push(value); return builder; },
        insert: () => builder,
        maybeSingle: async () => ({ data: { chat_id: 1 }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return builder;
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob(["fixture"]), error: null }) }) },
  };
  const send = async () => { if (sendError) throw new Error(sendError); return { message_id: 7 }; };
  const telegram = { sendTelegramMessage: send, sendTelegramMedia: send };
  const source = readFileSync(new URL("../src/lib/telegram.functions.ts", import.meta.url), "utf8")
    .replace(/^import[^\n]+\n/gm, "")
    .replaceAll("export const ", "const ")
    .replaceAll('await import("@/lib/telegram.server")', "telegram")
    .replaceAll('await import("@/integrations/supabase/client.server")', "({ supabaseAdmin: client })");
  const createServerFn = () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
    return builder;
  };
  const handler = new Function("createServerFn", "z", "requireSupabaseAuth", "telegram", "client", "isTelegramBotBlocked",
    new Bun.Transpiler({ loader: "ts" }).transformSync(source) + `\nreturn ${kind === "text" ? "sendTelegramReply" : "sendTelegramMedia"};`)(createServerFn, z, {}, telegram, client, isTelegramBotBlocked);
  return { updates, run: () => handler({ data: { chatRowId: "chat", text: "fixture", kind: "document", storagePath: "fixture", fileName: "fixture", mime: "text/plain" }, context: { supabase: client, userId: "staff" } }) };
}

for (const kind of ["text", "media"] as const) {
  describe(`${kind} reply block classification`, () => {
    it("marks only an explicit customer block", async () => {
      const f = replyFixture(kind, "Telegram sendMessage failed [403]: Forbidden: bot was blocked by the user");
      await expect(f.run()).rejects.toThrow("고객이 봇을 차단했습니다");
      expect(f.updates.length).toBe(1);
      expect(f.updates[0]?.is_blocked).toBe(true);
    });
    it("preserves the original missing-chat error without marking a customer block", async () => {
      const f = replyFixture(kind, "Telegram sendMessage failed [400]: Bad Request: chat not found");
      await expect(f.run()).rejects.toThrow("chat not found");
      expect(f.updates).toEqual([]);
    });
    it("preserves a generic forbidden error without marking a customer block", async () => {
      const f = replyFixture(kind, "Telegram sendMessage failed [403]: Forbidden: user is deactivated");
      await expect(f.run()).rejects.toThrow("user is deactivated");
      expect(f.updates).toEqual([]);
    });
  });
}

async function inboundFixture(options: { blockedAt: number; date: number; edit?: boolean; duplicate?: boolean; group?: boolean }) {
  let blocked = true;
  let clears = 0;
  const client = { from: () => {
    let clearing = false;
    let messageDate = 0;
    const builder = {
      select: () => builder,
      eq: () => builder,
      lte: (_column: string, date: string) => { messageDate = Date.parse(date) / 1000; return builder; },
      update: (value: Record<string, unknown>) => { clearing = value.is_blocked === false; return builder; },
      insert: () => builder,
      maybeSingle: async () => ({ data: { id: "chat", banned: false, status: "new", language: "uz" }, error: null }),
      single: async () => options.duplicate ? { data: null, error: { code: "23505" } } : { data: { id: "message" }, error: null },
      then: (resolve: (value: unknown) => unknown) => {
        if (clearing && options.blockedAt <= messageDate) { blocked = false; clears++; }
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return builder;
  } };
  const source = readFileSync(new URL("../src/routes/api/public/telegram/webhook.ts", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\n/gm, "")
    .replace("export const Route =", "const Route =")
    .replace('await import("@/integrations/supabase/client.server")', "({ supabaseAdmin: client })")
    .replace(/function safeEqual\([\s\S]*?\n\}/, "function safeEqual(a,b) { return a === b; }");
  const handler = new Function("createFileRoute", "deriveWebhookSecret", "client", "inboundInsertOutcome", "sendTelegramMessage", "BOT_COPY",
    new Bun.Transpiler({ loader: "ts" }).transformSync(source) + "\nreturn Route.server.handlers.POST;")(
    () => (config: unknown) => config, () => "fixture-secret", client, inboundInsertOutcome, async () => ({}), { unsubscribed: { uz: "fixture" } });
  const message = { message_id: 1, from: { id: 1 }, chat: { id: 1, type: options.group ? "group" : "private" }, date: options.date, text: "/stop" };
  await handler({ request: new Request("https://fixture.invalid", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "fixture-secret" }, body: JSON.stringify({ update_id: 1, [options.edit ? "edited_message" : "message"]: message }) }) });
  return { blocked, clears };
}

describe("fresh inbound block recovery", () => {
  it("clears older block evidence after a fresh private customer message", async () => {
    expect(await inboundFixture({ blockedAt: 100, date: 101 })).toEqual({ blocked: false, clears: 1 });
  });
  it("does not let an older queued message clear a newer block", async () => {
    expect(await inboundFixture({ blockedAt: 102, date: 101 })).toEqual({ blocked: true, clears: 0 });
  });
  it("does not clear blocks on duplicate retries", async () => {
    expect(await inboundFixture({ blockedAt: 100, date: 101, duplicate: true })).toEqual({ blocked: true, clears: 0 });
  });
  it("does not clear blocks on edited messages", async () => {
    expect(await inboundFixture({ blockedAt: 100, date: 101, edit: true })).toEqual({ blocked: true, clears: 0 });
  });
  it("does not clear private-chat block evidence from group messages", async () => {
    expect(await inboundFixture({ blockedAt: 100, date: 101, group: true })).toEqual({ blocked: true, clears: 0 });
  });
});