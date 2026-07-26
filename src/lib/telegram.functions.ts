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
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { chatRowId, text } = data;
    const { userId, supabase } = context;

    // Look up chat_id via the authenticated client (RLS allows all authenticated to read)
    const { data: chat, error: chatErr } = await supabase
      .from("telegram_chats")
      .select("chat_id")
      .eq("id", chatRowId)
      .maybeSingle();
    if (chatErr || !chat) throw new Error("Chat not found");

    const { sendTelegramMessage } = await import("@/lib/telegram.server");
    let telegramMessageId: number | null = null;
    try {
      const result = await sendTelegramMessage(Number(chat.chat_id), text);
      telegramMessageId = result.message_id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
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
    });
    if (insErr) throw new Error(insErr.message);

    await supabase
      .from("telegram_chats")
      .update({
        last_message_preview: text.slice(0, 200),
        last_message_at: new Date().toISOString(),
        status: "in_progress",
      })
      .eq("id", chatRowId);

    return { ok: true, telegramMessageId };
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
    const { error } = await context.supabase
      .from("telegram_chats")
      .update({ status: data.status })
      .eq("id", data.chatRowId);
    if (error) throw new Error(error.message);
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
