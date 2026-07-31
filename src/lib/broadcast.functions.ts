import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const langFilterSchema = z.enum(["all", "uz", "ru"]);

async function assertAdmin(context: { supabase: any; userId: string }) {
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
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { broadcastId: (row as { id: string }).id };
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deliver one throttled batch (~1 message/second) of a broadcast.
 * The client calls this repeatedly with the returned cursor until `done`.
 * Recipients who blocked the bot (403) are skipped and auto opted-out.
 */
export const sendBroadcastBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        broadcastId: z.string().uuid(),
        afterId: z.string().uuid().nullable().optional(),
        batchSize: z.number().int().min(1).max(30).default(15),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: bc, error: bcErr } = await supabase
      .from("broadcasts")
      .select(
        "id, message, lang_filter, media_storage_path, media_file_name, media_mime, media_kind, success_count, failed_count",
      )
      .eq("id", data.broadcastId)
      .maybeSingle();
    if (bcErr || !bc) throw new Error("발송 기록을 찾을 수 없습니다.");

    const b = bc as {
      message: string;
      lang_filter: string;
      media_storage_path: string | null;
      media_file_name: string | null;
      media_mime: string | null;
      media_kind: string | null;
      success_count: number;
      failed_count: number;
    };

    let q = supabase
      .from("telegram_chats")
      .select("id, chat_id, language")
      .eq("marketing_opt_in", true)
      .eq("is_blocked", false)
      .order("id", { ascending: true })
      .limit(data.batchSize);
    if (b.lang_filter !== "all") q = q.eq("language", b.lang_filter);
    if (data.afterId) q = q.gt("id", data.afterId);

    const { data: chats, error: chatsErr } = await q;
    if (chatsErr) throw new Error(chatsErr.message);

    const rows = (chats ?? []) as Array<{ id: string; chat_id: number; language: string | null }>;
    if (rows.length === 0) {
      await supabase
        .from("broadcasts")
        .update({ status: "completed" } as never)
        .eq("id", data.broadcastId);
      return {
        done: true as const,
        lastId: data.afterId ?? null,
        sent: 0,
        failed: 0,
        totalSuccess: b.success_count,
        totalFailed: b.failed_count,
      };
    }

    const { BOT_COPY, sendTelegramMessage, sendTelegramMedia } = await import(
      "@/lib/telegram.server"
    );

    // Load the attachment once per batch.
    let mediaBytes: Uint8Array | null = null;
    if (b.media_storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dl, error: dlErr } = await supabaseAdmin.storage
        .from("telegram-media")
        .download(b.media_storage_path);
      if (dlErr || !dl) throw new Error("첨부파일을 불러올 수 없습니다.");
      mediaBytes = new Uint8Array(await dl.arrayBuffer());
    }

    let sent = 0;
    let failed = 0;
    let lastId = data.afterId ?? null;

    for (let i = 0; i < rows.length; i++) {
      const chat = rows[i];
      lastId = chat.id;
      const lang: "uz" | "ru" = chat.language === "ru" ? "ru" : "uz";
      const body = `${b.message}${BOT_COPY.broadcastFooter[lang]}`;
      try {
        if (mediaBytes && b.media_kind) {
          await sendTelegramMedia(
            Number(chat.chat_id),
            b.media_kind === "photo" ? "photo" : "document",
            mediaBytes,
            b.media_file_name ?? "file",
            b.media_mime ?? "application/octet-stream",
            body.slice(0, 1024),
          );
        } else {
          await sendTelegramMessage(Number(chat.chat_id), body);
        }
        sent++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        const blocked = /\[403\]|bot was blocked|user is deactivated|chat not found/i.test(msg);
        // Any delivery failure removes the recipient from future broadcasts.
        await supabase
          .from("telegram_chats")
          .update({
            marketing_opt_in: false,
            opt_in_date: null,
            ...(blocked ? { is_blocked: true, blocked_at: new Date().toISOString() } : {}),
          } as never)
          .eq("id", chat.id);
        console.error(`[broadcast] send failed for chat ${chat.chat_id}: ${msg}`);
      }
      // Throttle: ~1 message per second (well under Telegram's limits).
      if (i < rows.length - 1) await sleep(1000);
    }

    const totalSuccess = b.success_count + sent;
    const totalFailed = b.failed_count + failed;
    await supabase
      .from("broadcasts")
      .update({
        success_count: totalSuccess,
        failed_count: totalFailed,
        status: rows.length < data.batchSize ? "completed" : "sending",
      } as never)
      .eq("id", data.broadcastId);

    return {
      done: rows.length < data.batchSize,
      lastId,
      sent,
      failed,
      totalSuccess,
      totalFailed,
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
        "id, message, lang_filter, media_file_name, target_count, success_count, failed_count, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { broadcasts: data ?? [] };
  });
