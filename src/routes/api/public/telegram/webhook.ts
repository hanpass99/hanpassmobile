import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import {
  answerCallbackQuery,
  BOT_COPY,
  type BotLang,
  deriveWebhookSecret,
  downloadTelegramFile,
  editMessageText,
  formatKoreanPhone,
  getFilePath,
  normalizePhone,
  removeKeyboard,
  sendContactRequest,
  sendLanguagePicker,
  sendTelegramMessage,
} from "@/lib/telegram.server";

// Returns the current hour (0-23) in the given IANA timezone.
function getHourInTimezone(tz: string, date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(date);
  // Intl may return "24" for midnight in some environments; normalize.
  const n = parseInt(h, 10);
  return Number.isFinite(n) ? n % 24 : new Date().getUTCHours();
}

// Start (UTC ms) of the current off-hours session for the given tz + business window.
// If it's currently before startHour → session started at endHour of the previous local day.
// If it's currently at/after endHour → session started at endHour of today.
function currentOffHoursSessionStart(
  tz: string,
  startHour: number,
  endHour: number,
  now = new Date(),
): Date | null {
  const hour = getHourInTimezone(tz, now);
  if (hour >= startHour && hour < endHour) return null; // within business hours
  // Get local Y-M-D in tz
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  // Approximate tz offset: build a date at "YYYY-MM-DDTHH:00:00Z" then diff with same wall time interpreted in tz.
  // Simpler: use the fact that Asia/Seoul has no DST → fixed +09:00. For general tz, compute offset dynamically.
  const asUtc = new Date(`${y}-${m}-${d}T00:00:00Z`);
  const localMidnightHour = getHourInTimezone(tz, asUtc);
  // tz offset in hours = (0 - localMidnightHour) mod 24, but this loses sign around DST; good enough for fixed offsets.
  const tzOffsetHours = localMidnightHour === 0 ? 0 : 24 - localMidnightHour;
  if (hour >= endHour) {
    // Session started today at endHour local time
    return new Date(Date.UTC(+y, +m - 1, +d, endHour - tzOffsetHours, 0, 0));
  }
  // hour < startHour → session started yesterday at endHour local time
  const yesterday = new Date(Date.UTC(+y, +m - 1, +d, endHour - tzOffsetHours, 0, 0));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday;
}


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

type TgPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

type TgDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TgPhotoSize;
};

type TgVideo = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
};

type TgVoice = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
};

type TgAudio = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
  title?: string;
};

type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: {
    id: number;
    type: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  date: number;
  text?: string;
  caption?: string;
  contact?: TgContact;
  photo?: TgPhotoSize[];
  document?: TgDocument;
  video?: TgVideo;
  voice?: TgVoice;
  audio?: TgAudio;
  sticker?: { file_id: string; emoji?: string };
};

type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};

type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
};


type MediaKind = "text" | "photo" | "document" | "video" | "voice" | "audio" | "sticker" | "contact" | "other";

type MediaDescriptor = {
  kind: MediaKind;
  fileId?: string;
  fileName?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
};

function detectMedia(m: TgMessage): MediaDescriptor {
  if (m.photo && m.photo.length > 0) {
    // Pick largest photo size
    const largest = m.photo.reduce((a, b) => ((b.file_size ?? 0) > (a.file_size ?? 0) ? b : a));
    return {
      kind: "photo",
      fileId: largest.file_id,
      mime: "image/jpeg",
      size: largest.file_size,
      width: largest.width,
      height: largest.height,
    };
  }
  if (m.document) {
    return {
      kind: "document",
      fileId: m.document.file_id,
      fileName: m.document.file_name,
      mime: m.document.mime_type,
      size: m.document.file_size,
    };
  }
  if (m.video) {
    return {
      kind: "video",
      fileId: m.video.file_id,
      fileName: m.video.file_name,
      mime: m.video.mime_type ?? "video/mp4",
      size: m.video.file_size,
      width: m.video.width,
      height: m.video.height,
      duration: m.video.duration,
    };
  }
  if (m.voice) {
    return {
      kind: "voice",
      fileId: m.voice.file_id,
      mime: m.voice.mime_type ?? "audio/ogg",
      size: m.voice.file_size,
      duration: m.voice.duration,
    };
  }
  if (m.audio) {
    return {
      kind: "audio",
      fileId: m.audio.file_id,
      fileName: m.audio.file_name ?? m.audio.title,
      mime: m.audio.mime_type ?? "audio/mpeg",
      size: m.audio.file_size,
      duration: m.audio.duration,
    };
  }
  if (m.sticker) {
    return { kind: "sticker", fileId: m.sticker.file_id, mime: "image/webp" };
  }
  if (m.contact) return { kind: "contact" };
  if (m.text) return { kind: "text" };
  return { kind: "other" };
}

function extForMime(mime: string | undefined, fallback = "bin"): string {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "application/pdf": "pdf",
    "application/zip": "zip",
  };
  if (map[mime]) return map[mime];
  const guess = mime.split("/")[1]?.split(";")[0];
  return guess || fallback;
}

function previewForKind(kind: MediaKind, caption?: string | null, text?: string | null): string {
  if (text) return text.slice(0, 200);
  const emoji: Record<MediaKind, string> = {
    text: "",
    photo: "📷 Photo",
    document: "📎 File",
    video: "🎬 Video",
    voice: "🎤 Voice",
    audio: "🎵 Audio",
    sticker: "🎨 Sticker",
    contact: "📱 Contact",
    other: "(message)",
  };
  const base = emoji[kind] ?? "(message)";
  return caption ? `${base} · ${caption.slice(0, 160)}` : base;
}

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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Handle language-picker callback first
        if (update.callback_query) {
          const cq = update.callback_query;
          const chatId = cq.message?.chat?.id;
          const data = cq.data ?? "";
          if (chatId && data.startsWith("lang:")) {
            const lang = (data.split(":")[1] === "ru" ? "ru" : "uz") as BotLang;
            await supabaseAdmin
              .from("telegram_chats")
              .update({ language: lang })
              .eq("chat_id", chatId);
            try {
              if (cq.message?.message_id) {
                await editMessageText(
                  chatId,
                  cq.message.message_id,
                  lang === "uz" ? "✅ Til: O'zbek" : "✅ Язык: Русский",
                );
              }
            } catch (e) {
              console.error("[telegram webhook] editMessageText failed", e);
            }
            try {
              await sendContactRequest(chatId, lang);
            } catch (e) {
              console.error("[telegram webhook] sendContactRequest failed", e);
            }
            try {
              await answerCallbackQuery(cq.id);
            } catch (e) {
              console.error("[telegram webhook] answerCallbackQuery failed", e);
            }
          }
          return Response.json({ ok: true });
        }

        const message = update.message ?? update.edited_message;
        if (!message?.chat?.id) return Response.json({ ok: true, ignored: true });

        const chatId = message.chat.id;
        const from = message.from;
        const media = detectMedia(message);
        const caption = message.caption ?? null;
        const preview = previewForKind(media.kind, caption, message.text ?? null);
        const nowIso = new Date(message.date * 1000).toISOString();


        // Upsert chat row
        const { data: existing } = await supabaseAdmin
          .from("telegram_chats")
          .select("id, customer_id, is_matched, unread_count, phone, language")
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
              // Any inbound message re-opens a completed chat as "new"
              status: "new",
            })
            .eq("id", rowId);
        }

        // Determine current chat language (default 'uz' until user picks)
        const chatLang: BotLang = (existing?.language === "ru" ? "ru" : "uz");

        // Contact auto-match — normalize incoming number and query DB by digits (ignoring formatting)
        if (message.contact?.phone_number) {
          const digits = normalizePhone(message.contact.phone_number);
          if (digits) {
            const storedPhone = formatKoreanPhone(digits) ?? digits;
            // Match against the CRM DB by comparing digits regardless of formatting.
            // Try both the raw digits and the hyphenated 010-XXXX-XXXX form.
            const orFilter = [
              `phone.eq.${digits}`,
              storedPhone !== digits ? `phone.eq.${storedPhone}` : null,
            ]
              .filter(Boolean)
              .join(",");
            const { data: cust } = await supabaseAdmin
              .from("customers")
              .select("id, name")
              .or(orFilter)
              .limit(1)
              .maybeSingle();
            if (cust) {
              await supabaseAdmin
                .from("telegram_chats")
                .update({ customer_id: cust.id, phone: storedPhone, is_matched: true })
                .eq("id", rowId);
            } else {
              await supabaseAdmin
                .from("telegram_chats")
                .update({ phone: storedPhone })
                .eq("id", rowId);
            }
            try {
              await removeKeyboard(chatId, BOT_COPY.checking[chatLang]);
            } catch (e) {
              console.error("[telegram webhook] removeKeyboard failed", e);
            }
          }
        }


        // Download media (if any) and upload to Storage
        let media_storage_path: string | null = null;
        let media_url: string | null = null;
        let media_file_name: string | null = media.fileName ?? null;
        let media_mime: string | null = media.mime ?? null;
        let media_size: number | null = media.size ?? null;

        if (media.fileId && media.kind !== "text" && media.kind !== "contact") {
          try {
            const filePath = await getFilePath(media.fileId);
            const { bytes, contentType } = await downloadTelegramFile(filePath);
            const ext = extForMime(media.mime ?? contentType, filePath.split(".").pop() || "bin");
            const safeName = media_file_name?.replace(/[^\w.\-]+/g, "_") ?? `${media.kind}.${ext}`;
            const storagePath = `chats/${chatId}/${message.message_id}-${Date.now()}-${safeName}`;

            const { error: upErr } = await supabaseAdmin.storage
              .from("telegram-media")
              .upload(storagePath, bytes, {
                contentType: media.mime ?? contentType,
                upsert: false,
              });
            if (upErr) {
              console.error("[telegram webhook] storage upload failed", upErr);
            } else {
              media_storage_path = storagePath;
              media_mime = media.mime ?? contentType;
              media_size = media_size ?? bytes.byteLength;
              // Public URL only works when bucket is public; keep as fallback ref
              media_url = supabaseAdmin.storage
                .from("telegram-media")
                .getPublicUrl(storagePath).data.publicUrl;
            }
          } catch (e) {
            console.error("[telegram webhook] media download/upload failed", e);
          }
        }

        // Save the message
        const { error: msgErr } = await supabaseAdmin.from("telegram_messages").insert({
          chat_id: chatId,
          telegram_chat_row_id: rowId,
          direction: "in",
          telegram_message_id: message.message_id,
          message_type: media.kind,
          text: message.text ?? null,
          caption,
          media_storage_path,
          media_url,
          media_file_name,
          media_mime,
          media_size,
          media_width: media.width ?? null,
          media_height: media.height ?? null,
          media_duration: media.duration ?? null,
          raw: message as never,
        });
        if (msgErr && !msgErr.message.includes("duplicate")) {
          console.error("[telegram webhook] insert message failed", msgErr);
        }

        // First-time greeting: show language picker (uz / ru)
        if (isFirstMessage && !message.contact) {
          try {
            await sendLanguagePicker(chatId);
          } catch (e) {
            console.error("[telegram webhook] language picker failed", e);
          }
        }

        // Off-hours auto-reply: throttle to one message per off-hours session per chat.
        // Runs AFTER the inbound message is saved, so CRM history is unaffected.
        try {
          const { data: bh } = await supabaseAdmin
            .from("business_hours")
            .select("start_hour, end_hour, timezone, auto_reply_uz, auto_reply_ru")
            .eq("singleton", true)
            .maybeSingle();
          const startHour = bh?.start_hour ?? 10;
          const endHour = bh?.end_hour ?? 19;
          const tz = bh?.timezone ?? "Asia/Seoul";
          const sessionStart = currentOffHoursSessionStart(tz, startHour, endHour);
          if (sessionStart) {
            // Fetch throttle marker (refetch to include the column even if `existing` predates the column)
            const { data: chatRow } = await supabaseAdmin
              .from("telegram_chats")
              .select("last_off_hours_auto_reply_at, language")
              .eq("id", rowId)
              .maybeSingle();
            const lastAt = chatRow?.last_off_hours_auto_reply_at
              ? new Date(chatRow.last_off_hours_auto_reply_at as string)
              : null;
            if (!lastAt || lastAt < sessionStart) {
              const lang: BotLang = (chatRow?.language === "ru" ? "ru" : chatLang);
              const text = lang === "ru"
                ? (bh?.auto_reply_ru ?? "")
                : (bh?.auto_reply_uz ?? "");
              if (text) {
                await sendTelegramMessage(chatId, text);
                await supabaseAdmin
                  .from("telegram_chats")
                  .update({ last_off_hours_auto_reply_at: new Date().toISOString() })
                  .eq("id", rowId);
              }
            }
          }
        } catch (e) {
          console.error("[telegram webhook] off-hours auto-reply failed", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
