import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const langFilterSchema = z.enum(["all", "uz", "ru"]);

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  } as never);
  if (!isAdmin) throw new Error("관리자만 사용할 수 있습니다.");
}

/** Count of customers who opted in to marketing messages (optionally by language). */
export const getBroadcastAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ langFilter: langFilterSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("telegram_chats")
      .select("id", { count: "exact", head: true })
      .eq("marketing_opt_in", true)
      .eq("is_blocked", false);
    if (data.langFilter !== "all") q = q.eq("language", data.langFilter);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

/** Create a broadcast record (status: sending). Actual delivery runs in batches. */
export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        message: z.string().max(3500),
        langFilter: langFilterSchema,
        media: z
          .object({
            storagePath: z.string().min(1),
            fileName: z.string().min(1).max(200),
            mime: z.string().min(1).max(120),
            kind: z.enum(["photo", "document"]),
          })
          .nullable()
          .optional(),
        targetCount: z.number().int().nonnegative(),
      })
      .refine((v) => v.message.trim().length > 0 || !!v.media, {
        message: "메시지 또는 첨부파일이 필요합니다.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("broadcasts")
      .insert({
        sender_id: context.userId,
        message: data.message,
        lang_filter: data.langFilter,
        media_storage_path: data.media?.storagePath ?? null,
        media_file_name: data.media?.fileName ?? null,
        media_mime: data.media?.mime ?? null,
        media_kind: data.media?.kind ?? null,
        target_count: data.targetCount,
        status: "sending",
        delivery_version: 1,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { broadcastId: (row as { id: string }).id };
  });

/** One recipient per request; the database owns the cursor and exclusive claim. */
export const sendBroadcastBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ broadcastId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const lockId = crypto.randomUUID();
    const { data: claimed, error: claimError } = await supabase.rpc("claim_broadcast_delivery", {
      broadcast_id: data.broadcastId,
      lock_id: lockId,
    });
    if (claimError) throw new Error(claimError.message);
    const b = claimed as {
      message: string;
      lang_filter: string;
      media_storage_path: string | null;
      media_file_name: string | null;
      media_mime: string | null;
      media_kind: string | null;
      success_count: number;
      failed_count: number;
      delivery_cursor: string | null;
      status: string;
    };
    if (b.status === "completed")
      return { done: true, totalSuccess: b.success_count, totalFailed: b.failed_count };
    let cursor = b.delivery_cursor;
    const checkpoint = async (sent: number, failed: number, completed: boolean) => {
      const args = {
        broadcast_id: data.broadcastId,
        lock_id: lockId,
        cursor_id: cursor,
        sent,
        failed,
        completed,
      };
      // Generated RPC types omit nullable SQL arguments.
      const { error } = await supabase.rpc("checkpoint_broadcast_delivery", args as never);
      if (error) throw new Error(error.message);
    };
    let q = supabase
      .from("telegram_chats")
      .select("id, chat_id, language")
      .eq("marketing_opt_in", true)
      .eq("is_blocked", false)
      .order("id", { ascending: true })
      .limit(1);
    if (b.lang_filter !== "all") q = q.eq("language", b.lang_filter);
    if (cursor) q = q.gt("id", cursor);
    const { data: chats, error: chatsError } = await q;
    if (chatsError) {
      await checkpoint(0, 0, false);
      throw new Error(chatsError.message);
    }
    const chat = chats?.[0];
    if (!chat) {
      await checkpoint(0, 0, true);
      return { done: true, totalSuccess: b.success_count, totalFailed: b.failed_count };
    }
    const { BOT_COPY, sendTelegramMessage, sendTelegramMedia, unsubscribeMarkup } =
      await import("@/lib/telegram.server");
    let mediaBytes: Uint8Array | null = null;
    if (b.media_storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dl, error } = await supabaseAdmin.storage
        .from("telegram-media")
        .download(b.media_storage_path);
      if (error || !dl) {
        await checkpoint(0, 0, false);
        throw new Error("첨부파일을 불러올 수 없습니다.");
      }
      mediaBytes = new Uint8Array(await dl.arrayBuffer());
    }
    const lang = chat.language === "ru" ? "ru" : "uz";
    const body = `${b.message}${BOT_COPY.broadcastFooter[lang]}`;
    let sent = 0;
    let failed = 0;
    try {
      const signal = AbortSignal.timeout(10_000);
      if (mediaBytes && b.media_kind) {
        await sendTelegramMedia(
          Number(chat.chat_id),
          b.media_kind === "photo" ? "photo" : "document",
          mediaBytes,
          b.media_file_name ?? "file",
          b.media_mime ?? "application/octet-stream",
          body.slice(0, 1024),
          null,
          unsubscribeMarkup(lang),
          signal,
        );
      } else {
        await sendTelegramMessage(
          Number(chat.chat_id),
          body,
          null,
          unsubscribeMarkup(lang),
          signal,
        );
      }
      sent = 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // An uncertain response may have delivered: keep the claim, never blindly resend.
      if (!/failed \[4\d\d\]/.test(msg)) throw new Error("broadcast_delivery_uncertain");
      if (/\[429\]/.test(msg)) {
        await checkpoint(0, 0, false);
        throw new Error("broadcast_rate_limited");
      }
      failed = 1;
      if (/\[403\]|chat not found/i.test(msg)) {
        const { error } = await supabase
          .from("telegram_chats")
          .update({
            marketing_opt_in: false,
            opt_in_date: null,
            is_blocked: true,
            blocked_at: new Date().toISOString(),
          })
          .eq("id", chat.id);
        if (error) console.error("[broadcast] blocked recipient update failed");
      }
      console.error(`[broadcast] delivery rejected: ${msg}`);
    }
    cursor = chat.id;
    await checkpoint(sent, failed, false);
    return {
      done: false,
      totalSuccess: b.success_count + sent,
      totalFailed: b.failed_count + failed,
    };
  });

/** Recent broadcast history (admin only). */
export const listBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("broadcasts")
      .select(
        "id, message, lang_filter, media_file_name, target_count, success_count, failed_count, status, created_at, delivery_version, delivery_lock",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { broadcasts: data ?? [] };
  });
