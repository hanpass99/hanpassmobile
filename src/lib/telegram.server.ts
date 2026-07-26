// Server-only Telegram Bot API helpers. Never import from browser code.
import { createHash } from "node:crypto";

export const TELEGRAM_API_BASE = "https://api.telegram.org";

export function getBotToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

/** Deterministic webhook secret derived from the bot token so both
 * the setWebhook call and the receiver agree without an extra secret. */
export function deriveWebhookSecret(): string {
  return createHash("sha256")
    .update(`telegram-webhook:${getBotToken()}`)
    .digest("base64url");
}

async function callBot<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Telegram ${method} non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!res.ok || parsed?.ok === false) {
    throw new Error(
      `Telegram ${method} failed [${res.status}]: ${parsed?.description ?? text}`,
    );
  }
  return parsed.result as T;
}

export async function sendTelegramMessage(chatId: number, text: string) {
  return callBot<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
  });
}

export async function sendContactRequest(chatId: number, prompt: string) {
  return callBot<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: prompt,
    reply_markup: {
      keyboard: [
        [{ text: "📱 Share phone / 전화번호 공유", request_contact: true }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

export async function removeKeyboard(chatId: number, text: string) {
  return callBot<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: { remove_keyboard: true },
  });
}

export async function setWebhook(url: string) {
  return callBot("setWebhook", {
    url,
    secret_token: deriveWebhookSecret(),
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: false,
  });
}

export async function getWebhookInfo() {
  return callBot("getWebhookInfo", {});
}

export async function getMe() {
  return callBot<{ id: number; username: string; first_name: string }>("getMe", {});
}

/** Normalize phone to the CRM canonical formats used elsewhere. */
export function normalizePhone(raw: string): string | null {
  const digits = (raw || "").toString().replace(/\D/g, "");
  const normalizedDigits =
    digits.length === 13 && digits.startsWith("82010")
      ? `8210${digits.slice(5)}`
      : digits;
  if (normalizedDigits.length === 11 && normalizedDigits.startsWith("010")) {
    return `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`;
  }
  if (normalizedDigits.length === 12 && normalizedDigits.startsWith("8210")) {
    return `${normalizedDigits.slice(0, 4)}-${normalizedDigits.slice(4, 8)}-${normalizedDigits.slice(8)}`;
  }
  return null;
}
