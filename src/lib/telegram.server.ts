// Server-only Telegram Bot API helpers. Never import from browser code.
import { createHash } from "node:crypto";

export const TELEGRAM_API_BASE = "https://api.telegram.org";

export type BotLang = "uz" | "ru";

export function getBotToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

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

/** Bot copy in Uzbek / Russian */
export const BOT_COPY = {
  contactPrompt: {
    uz: "Assalomu alaykum! Hanpass Mobile'ga xush kelibsiz. Sizga yordam berishimiz uchun quyidagi tugma orqali telefon raqamingizni yuboring.",
    ru: "Здравствуйте! Добро пожаловать в Hanpass Mobile. Пожалуйста, поделитесь своим номером телефона с помощью кнопки ниже, чтобы мы могли вам помочь.",
  },
  checking: {
    uz: "📞 Raqamingiz tekshirilmoqda. Operatorimiz tez orada javob beradi.",
    ru: "📞 Проверяем ваш номер. Оператор скоро ответит.",
  },
  shareButton: {
    uz: "📱 Telefon raqamni yuborish",
    ru: "📱 Отправить номер телефона",
  },
  languagePrompt:
    "Iltimos, tilni tanlang / Пожалуйста, выберите язык:",
  conversationClosed: {
    uz: "Murojaatingiz uchun rahmat! ✅ Suhbatingiz yakunlandi. Agar yana savolingiz bo'lsa, quyidagi tugmani bosing yoki /start yuboring. Sog' bo'ling!",
    ru: "Спасибо за обращение! ✅ Ваш диалог завершён. Если появятся вопросы, нажмите кнопку ниже или отправьте /start. Всего доброго!",
  },
  previouslyClosed: {
    uz: "Oldingi murojaatingiz yakunlangan. Yangi savol bermoqchi bo'lsangiz, quyidagi tugmani bosing yoki /start yuboring.",
    ru: "Ваше предыдущее обращение завершено. Чтобы задать новый вопрос, нажмите кнопку ниже или отправьте /start.",
  },
  newInquiryButton: {
    uz: "🆕 Yangi murojaat",
    ru: "🆕 Новое обращение",
  },
} as const;

/** Send a plain text message with a single inline button (used for closed-chat re-prompts). */
export async function sendMessageWithInlineButton(
  chatId: number,
  text: string,
  buttonText: string,
  callbackData: string,
) {
  return callBot<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: buttonText, callback_data: callbackData }]],
    },
  });
}

/** Show the initial language picker (inline keyboard). */
export async function sendLanguagePicker(chatId: number) {
  return callBot<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: BOT_COPY.languagePrompt,
    reply_markup: {
      inline_keyboard: [[
        { text: "🇺🇿 O'zbek", callback_data: "lang:uz" },
        { text: "🇷🇺 Русский", callback_data: "lang:ru" },
      ]],
    },
  });
}

/** Ask for contact using the localized keyboard button. */
export async function sendContactRequest(chatId: number, lang: BotLang) {
  return callBot<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: BOT_COPY.contactPrompt[lang],
    reply_markup: {
      keyboard: [[{ text: BOT_COPY.shareButton[lang], request_contact: true }]],
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

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callBot("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text ?? "",
  });
}

export async function editMessageText(chatId: number, messageId: number, text: string) {
  return callBot("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
  });
}

export async function setWebhook(url: string) {
  return callBot("setWebhook", {
    url,
    secret_token: deriveWebhookSecret(),
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function getWebhookInfo() {
  return callBot("getWebhookInfo", {});
}

export async function getMe() {
  return callBot<{ id: number; username: string; first_name: string }>("getMe", {});
}

export async function getFilePath(fileId: string): Promise<string> {
  const res = await callBot<{ file_path?: string; file_size?: number }>("getFile", {
    file_id: fileId,
  });
  if (!res.file_path) throw new Error(`getFile: no file_path for ${fileId}`);
  return res.file_path;
}

export async function downloadTelegramFile(
  filePath: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Telegram file download failed [${res.status}] for ${filePath}`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}

/**
 * Normalize a phone number for matching against the CRM DB.
 * - Strips spaces, hyphens, plus sign, and any non-digit chars.
 * - If it starts with "82" (Korean country code), removes "82" and prepends "0".
 *   e.g. 821080376033 → 01080376033, +82 10-8037-6033 → 01080376033
 * Returns the digits-only string, or null if empty/invalid.
 */
export function normalizePhone(raw: string): string | null {
  let digits = (raw || "").toString().replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("82")) {
    digits = "0" + digits.slice(2);
  }
  return digits || null;
}

/** Format 010XXXXXXXX (11 digits) into the hyphenated 010-XXXX-XXXX used by the CRM. */
export function formatKoreanPhone(digits: string): string | null {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("010")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  return null;
}
