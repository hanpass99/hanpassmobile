import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Send a reply to a Telegram chat, recording which staff sent it.
export const sendTelegramReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        chatRowId: z.string().uuid(),
        text: z.string().min(1).max(4000),
        replyToMessageId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { chatRowId, text, replyToMessageId } = data;
    const { userId, supabase } = context;

    // Look up chat_id via the authenticated client (RLS allows all authenticated to read)
    const { data: chat, error: chatErr } = await supabase
      .from("telegram_chats")
      .select("chat_id")
      .eq("id", chatRowId)
      .maybeSingle();
    if (chatErr || !chat) throw new Error("Chat not found");

    // Resolve reply target's telegram_message_id (must belong to same chat)
    let replyToTgId: number | null = null;
    if (replyToMessageId) {
      const { data: replyRow } = await supabase
        .from("telegram_messages")
        .select("telegram_message_id, telegram_chat_row_id")
        .eq("id", replyToMessageId)
        .maybeSingle();
      if (replyRow && replyRow.telegram_chat_row_id === chatRowId && replyRow.telegram_message_id) {
        replyToTgId = Number(replyRow.telegram_message_id);
      }
    }

    const { sendTelegramMessage } = await import("@/lib/telegram.server");
    let telegramMessageId: number | null = null;
    try {
      const result = await sendTelegramMessage(Number(chat.chat_id), text, replyToTgId);
      telegramMessageId = result.message_id;
      // Clear blocked flag if delivery succeeds
      await supabase
        .from("telegram_chats")
        .update({ is_blocked: false, blocked_at: null })
        .eq("id", chatRowId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/\[403\]|bot was blocked|user is deactivated|chat not found/i.test(msg)) {
        await supabase
          .from("telegram_chats")
          .update({ is_blocked: true, blocked_at: new Date().toISOString() })
          .eq("id", chatRowId);
        throw new Error("고객이 봇을 차단했습니다. SMS로 발송하세요.");
      }
      throw new Error(`텔레그램 전송 실패: ${msg}`);
    }

    // Record message + bump last_message
    const { error: insErr } = await supabase.from("telegram_messages").insert({
      chat_id: chat.chat_id,
      telegram_chat_row_id: chatRowId,
      direction: "out",
      telegram_message_id: telegramMessageId,
      text,
      sent_by: userId,
      reply_to_message_id: replyToMessageId ?? null,
      reply_to_telegram_message_id: replyToTgId,
    } as never);
    if (insErr) throw new Error(insErr.message);

    await supabase
      .from("telegram_chats")
      .update({
        last_message_preview: text.slice(0, 200),
        last_message_at: new Date().toISOString(),
        status: "in_progress",
        assigned_operator_id: userId,
        unread_count: 0,
      })
      .eq("id", chatRowId);

    return { ok: true, telegramMessageId };
  });

// Send a photo or document to a Telegram chat (from an already-uploaded storage object).
export const sendTelegramMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        chatRowId: z.string().uuid(),
        storagePath: z.string().min(1),
        fileName: z.string().min(1).max(200),
        mime: z.string().min(1).max(120),
        size: z.number().int().nonnegative(),
        kind: z.enum(["photo", "document"]),
        caption: z.string().max(1024).optional().nullable(),
        replyToMessageId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: chat, error: chatErr } = await supabase
      .from("telegram_chats")
      .select("chat_id")
      .eq("id", data.chatRowId)
      .maybeSingle();
    if (chatErr || !chat) throw new Error("Chat not found");

    let replyToTgId: number | null = null;
    if (data.replyToMessageId) {
      const { data: replyRow } = await supabase
        .from("telegram_messages")
        .select("telegram_message_id, telegram_chat_row_id")
        .eq("id", data.replyToMessageId)
        .maybeSingle();
      if (
        replyRow &&
        replyRow.telegram_chat_row_id === data.chatRowId &&
        replyRow.telegram_message_id
      ) {
        replyToTgId = Number(replyRow.telegram_message_id);
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dl, error: dlErr } = await supabaseAdmin.storage
      .from("telegram-media")
      .download(data.storagePath);
    if (dlErr || !dl) throw new Error(`저장 파일을 불러올 수 없습니다: ${dlErr?.message ?? "unknown"}`);
    const bytes = new Uint8Array(await dl.arrayBuffer());

    const { sendTelegramMedia: sendMediaBot } = await import("@/lib/telegram.server");
    let tgMsgId: number | null = null;
    try {
      const r = await sendMediaBot(
        Number(chat.chat_id),
        data.kind,
        bytes,
        data.fileName,
        data.mime,
        data.caption ?? undefined,
        replyToTgId,
      );
      tgMsgId = r.message_id;
      await supabase
        .from("telegram_chats")
        .update({ is_blocked: false, blocked_at: null })
        .eq("id", data.chatRowId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/\[403\]|bot was blocked|user is deactivated|chat not found/i.test(msg)) {
        await supabase
          .from("telegram_chats")
          .update({ is_blocked: true, blocked_at: new Date().toISOString() })
          .eq("id", data.chatRowId);
        throw new Error("고객이 봇을 차단했습니다. SMS로 발송하세요.");
      }
      throw new Error(msg);
    }

    const messageType = data.kind === "photo" ? "photo" : "document";
    const preview = data.kind === "photo" ? "📷 Photo" : `📎 ${data.fileName}`;
    const publicUrl = supabaseAdmin.storage
      .from("telegram-media")
      .getPublicUrl(data.storagePath).data.publicUrl;

    const { error: insErr } = await supabase.from("telegram_messages").insert({
      chat_id: chat.chat_id,
      telegram_chat_row_id: data.chatRowId,
      direction: "out",
      telegram_message_id: tgMsgId,
      message_type: messageType,
      caption: data.caption ?? null,
      media_storage_path: data.storagePath,
      media_url: publicUrl,
      media_file_name: data.fileName,
      media_mime: data.mime,
      media_size: data.size,
      sent_by: userId,
      reply_to_message_id: data.replyToMessageId ?? null,
      reply_to_telegram_message_id: replyToTgId,
    } as never);
    if (insErr) throw new Error(insErr.message);

    await supabase
      .from("telegram_chats")
      .update({
        last_message_preview: data.caption ? `${preview} · ${data.caption.slice(0, 160)}` : preview,
        last_message_at: new Date().toISOString(),
        status: "in_progress",
        assigned_operator_id: userId,
        unread_count: 0,
      })
      .eq("id", data.chatRowId);

    return { ok: true, telegramMessageId: tgMsgId };
  });

// Edit a previously sent text message (both on Telegram and in the CRM DB).
// Sender identity (sent_by, direction, created_at) stays immutable via the DB audit trigger.
export const editTelegramMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        messageId: z.string().uuid(),
        text: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: msg, error: msgErr } = await supabase
      .from("telegram_messages")
      .select("id, chat_id, telegram_message_id, direction, sent_by, message_type")
      .eq("id", data.messageId)
      .maybeSingle();
    if (msgErr || !msg) throw new Error("메시지를 찾을 수 없습니다");
    if (msg.direction !== "out" || msg.sent_by !== userId) {
      throw new Error("본인이 보낸 메시지만 수정할 수 있습니다");
    }
    if (!msg.telegram_message_id) throw new Error("텔레그램 메시지 ID가 없어 수정할 수 없습니다");

    const { editMessageText } = await import("@/lib/telegram.server");
    try {
      if (msg.message_type === "text" || !msg.message_type) {
        await editMessageText(Number(msg.chat_id), Number(msg.telegram_message_id), data.text);
      } else {
        // For media, edit the caption instead
        const { editMessageCaption } = await import("@/lib/telegram.server");
        await editMessageCaption(Number(msg.chat_id), Number(msg.telegram_message_id), data.text);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/can't be edited|message to edit not found|too old/i.test(m)) {
        throw new Error("이 메시지는 텔레그램에서 수정할 수 없습니다 (시간 초과 또는 정책 제한).");
      }
      throw new Error(m);
    }

    const updatePayload =
      msg.message_type === "text" || !msg.message_type
        ? { text: data.text, edited_at: new Date().toISOString() }
        : { caption: data.text, edited_at: new Date().toISOString() };
    const { error: upErr } = await supabase
      .from("telegram_messages")
      .update(updatePayload)
      .eq("id", data.messageId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });

// Update conversation status (new / in_progress / done)
export const setTelegramChatStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        chatRowId: z.string().uuid(),
        status: z.enum(["new", "in_progress", "done"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Fetch prior state so we only send the closing message on new→done transitions
    const { data: prior } = await context.supabase
      .from("telegram_chats")
      .select("chat_id, status, language")
      .eq("id", data.chatRowId)
      .maybeSingle();

    const updatePayload: { status: typeof data.status; unread_count?: number } = { status: data.status };
    if (data.status === "done") {
      updatePayload.unread_count = 0;
    }
    const { error } = await context.supabase
      .from("telegram_chats")
      .update(updatePayload)
      .eq("id", data.chatRowId);
    if (error) throw new Error(error.message);

    // On transition to done, send the localized closing message with a "New inquiry" inline button
    if (data.status === "done" && prior && prior.status !== "done" && prior.chat_id) {
      try {
        const { BOT_COPY, sendMessageWithInlineButton } = await import("@/lib/telegram.server");
        const lang: "uz" | "ru" = prior.language === "ru" ? "ru" : "uz";
        await sendMessageWithInlineButton(
          Number(prior.chat_id),
          BOT_COPY.conversationClosed[lang],
          BOT_COPY.newInquiryButton[lang],
          "new_inquiry",
        );
      } catch (e) {
        console.error("[setTelegramChatStatus] closing message failed", e);
      }
    }
    return { ok: true };
  });

// Mark a chat as read (reset unread_count).
export const markTelegramChatRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chatRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("telegram_chats")
      .update({ unread_count: 0 })
      .eq("id", data.chatRowId);
    return { ok: true };
  });

// Manually match a telegram chat to a CRM customer.
export const linkTelegramChatToCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        chatRowId: z.string().uuid(),
        customerId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("telegram_chats")
      .update({
        customer_id: data.customerId,
        is_matched: data.customerId != null,
      })
      .eq("id", data.chatRowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Search customers by name/phone for manual matching.
export const searchCustomersForTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const q = data.query.trim();
    const { data: rows, error } = await context.supabase
      .from("customers")
      .select("id, name, phone, country_id, status")
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    return { customers: rows ?? [] };
  });

// Admin-only: register the Telegram webhook.
export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ webhookUrl: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    } as never);
    if (!isAdmin) throw new Error("Admin only");

    const { setWebhook, getMe, getWebhookInfo } = await import("@/lib/telegram.server");
    await setWebhook(data.webhookUrl);
    const me = await getMe();
    const info = await getWebhookInfo();
    return { ok: true as const, bot: me, infoJson: JSON.stringify(info) };
  });
