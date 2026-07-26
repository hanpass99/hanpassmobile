import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import {
  deriveWebhookSecret,
  normalizePhone,
  removeKeyboard,
  sendContactRequest,
} from "@/lib/telegram.server";

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TgContact = {
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  user_id?: number;
};

type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
  date: number;
  text?: string;
  contact?: TgContact;
};

type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
};

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify Telegram-issued secret header
        const expected = deriveWebhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as TgUpdate;
        const message = update.message ?? update.edited_message;
        if (!message?.chat?.id) return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const chatId = message.chat.id;
        const from = message.from;
        const previewFromText = message.text?.slice(0, 200) ?? null;
        const preview = previewFromText ?? (message.contact ? "📱 (contact shared)" : "(non-text)");
        const nowIso = new Date(message.date * 1000).toISOString();

        // Upsert chat row
        const { data: existing } = await supabaseAdmin
          .from("telegram_chats")
          .select("id, customer_id, is_matched, unread_count, phone")
          .eq("chat_id", chatId)
          .maybeSingle();

        let rowId: string;
        let isFirstMessage = false;

        if (!existing) {
          isFirstMessage = true;
          const { data: inserted, error } = await supabaseAdmin
            .from("telegram_chats")
            .insert({
              chat_id: chatId,
              telegram_user_id: from?.id ?? null,
              telegram_username: from?.username ?? message.chat.username ?? null,
              first_name: from?.first_name ?? message.chat.first_name ?? null,
              last_name: from?.last_name ?? message.chat.last_name ?? null,
              last_message_preview: preview,
              last_message_at: nowIso,
              unread_count: 1,
            })
            .select("id")
            .single();
          if (error) {
            console.error("[telegram webhook] insert chat failed", error);
            return Response.json({ ok: false }, { status: 500 });
          }
          rowId = inserted.id;
        } else {
          rowId = existing.id;
          await supabaseAdmin
            .from("telegram_chats")
            .update({
              last_message_preview: preview,
              last_message_at: nowIso,
              unread_count: (existing.unread_count ?? 0) + 1,
            })
            .eq("id", rowId);
        }

        // If contact shared, try to auto-match customer
        if (message.contact?.phone_number) {
          const normalized = normalizePhone(message.contact.phone_number);
          if (normalized) {
            const { data: cust } = await supabaseAdmin
              .from("customers")
              .select("id, name")
              .eq("phone", normalized)
              .maybeSingle();
            if (cust) {
              await supabaseAdmin
                .from("telegram_chats")
                .update({
                  customer_id: cust.id,
                  phone: normalized,
                  is_matched: true,
                })
                .eq("id", rowId);
              try {
                await removeKeyboard(
                  chatId,
                  `✅ 확인되었습니다. 잠시만 기다려주세요.\n✅ Verified. An agent will reply shortly.`,
                );
              } catch (e) {
                console.error("[telegram webhook] removeKeyboard failed", e);
              }
            } else {
              await supabaseAdmin
                .from("telegram_chats")
                .update({ phone: normalized })
                .eq("id", rowId);
              try {
                await removeKeyboard(
                  chatId,
                  `📞 번호를 확인 중입니다. 상담사가 곧 답변드립니다.\n📞 Checking your number. An agent will reply soon.`,
                );
              } catch (e) {
                console.error(e);
              }
            }
          }
        }

        // Save the message
        const { error: msgErr } = await supabaseAdmin.from("telegram_messages").insert({
          chat_id: chatId,
          telegram_chat_row_id: rowId,
          direction: "in",
          telegram_message_id: message.message_id,
          text: previewFromText ?? (message.contact ? `📱 ${message.contact.phone_number ?? ""}` : null),
          raw: message as never,
        });
        if (msgErr && !msgErr.message.includes("duplicate")) {
          console.error("[telegram webhook] insert message failed", msgErr);
        }

        // First-time greeting: ask for phone number
        if (isFirstMessage && !message.contact) {
          try {
            await sendContactRequest(
              chatId,
              `안녕하세요! 한패스 모바일입니다.\n원활한 상담을 위해 아래 버튼으로 전화번호를 공유해주세요.\n\nHello! This is Hanpass Mobile.\nPlease share your phone number using the button below so we can assist you.`,
            );
          } catch (e) {
            console.error("[telegram webhook] greeting failed", e);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
