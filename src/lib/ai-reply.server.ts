// Server-only AI auto-reply engine for Telegram inbound messages.
// Never import from browser code.

import type { BotLang } from "@/lib/telegram.server";

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";
const EMBEDDING_MODEL = "openai/text-embedding-3-small"; // 1536 dims
const CHAT_MODEL = "google/gemini-3.6-flash";

// Words/phrases that always require a human operator (money, personal info,
// legal/contract, refunds, etc.). Case-insensitive substring match.
// NOTE: 요금제/가격 정보는 매월 변경되므로 AI가 절대 답변하지 않고 담당자에게 넘긴다.
const SAFETY_KEYWORDS = [
  // KO/generic
  "환불", "취소", "약관", "개인정보", "결제", "요금", "요금제", "가격", "얼마",
  "금액", "비용", "할인", "프로모션", "이벤트", "데이터", "무제한", "월정액",
  // Russian
  "возврат", "отмен", "договор", "тариф", "оплат", "деньг", "штраф",
  "цена", "стоимость", "сколько стоит", "скольк", "прайс", "скидк", "акци",
  "гб", "трафик", "безлимит", "абонент",
  // Uzbek
  "qaytar", "bekor", "shartnoma", "tarif", "to'lov", "tolov", "pul", "jarima",
  "narx", "qancha", "qiymat", "chegirma", "aksiya", "gb", "limitsiz", "obuna",
  // English
  "price", "cost", "how much", "tariff", "plan", "discount", "promo", "unlimited",
];


function getApiKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not configured");
  return k;
}

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 4000);
  if (!trimmed) return [];
  const res = await fetch(`${GATEWAY_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": getApiKey(),
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: trimmed }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? [];
}

export function containsSafetyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return SAFETY_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

type FaqCandidate = {
  id: string;
  category: string | null;
  question_examples: string[];
  answer_uz: string;
  answer_ru: string;
  similarity: number;
};

type HistoryTurn = {
  role: "customer" | "operator";
  text: string;
};

type ReplyDecision = {
  confidence: number;
  reply: string | null;
  matchedFaqId: string | null;
  reason: string;
};

const SYSTEM_PROMPT = `You are the Hanpass Mobile customer support assistant. You help Uzbek/Russian-speaking customers in Korea with mobile plan activation, top-ups, and account questions.

Rules:
1. Answer ONLY based on the FAQ knowledge and past operator replies provided as context. If the context does not clearly cover the question, do NOT invent an answer.
2. Reply in the language specified by "target_language" (uz or ru). Keep it short (1–3 sentences), warm and polite.
3. Output STRICT JSON only: {"confidence": <0.0-1.0>, "reply": <string or null>, "matched_faq_id": <string or null>, "reason": <short internal note in Korean>}.
4. confidence: how sure you are the reply directly answers the question using the provided context. If FAQ context clearly matches → 0.85+. If loosely related → 0.4-0.7. If unrelated / missing info → below 0.3.
5. If confidence < 0.75, set reply to null (a human operator will handle it).
6. If the question is a greeting only (안녕/salom/привет) with no real question, set reply to a brief greeting and confidence 0.9.
7. NEVER answer anything about prices, plan/tariff fees, data amounts, discounts, promotions, refunds, delivery times, or personal-account actions. Plan and price information changes every month, so it must always be handled by a human operator: set reply to null, confidence 0.0, reason "요금제/가격 문의 → 담당자 이관".
8. Do NOT include the 🤖 prefix; the system adds it automatically.`;


export async function generateReply(
  question: string,
  lang: BotLang,
  faqs: FaqCandidate[],
  history: HistoryTurn[],
): Promise<ReplyDecision> {
  const faqBlock = faqs
    .map(
      (f, i) =>
        `[FAQ ${i + 1}] id=${f.id} similarity=${f.similarity.toFixed(2)}\nQ examples: ${f.question_examples.join(" | ")}\nA (uz): ${f.answer_uz}\nA (ru): ${f.answer_ru}`,
    )
    .join("\n\n");
  const historyBlock = history
    .map((h) => `${h.role === "customer" ? "고객" : "상담사"}: ${h.text}`)
    .join("\n");

  const userContent = `target_language: ${lang}

## FAQ candidates (may be empty)
${faqBlock || "(none)"}

## Recent conversation
${historyBlock || "(none)"}

## Current customer question
${question}`;

  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": getApiKey(),
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat completion failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = json.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { confidence: 0, reply: null, matchedFaqId: null, reason: `unparseable: ${raw.slice(0, 100)}` };
  }
  const confidence = Number(parsed.confidence ?? 0) || 0;
  const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : null;
  const matchedFaqId =
    typeof parsed.matched_faq_id === "string" && parsed.matched_faq_id.length > 0
      ? parsed.matched_faq_id
      : null;
  const reason = typeof parsed.reason === "string" ? parsed.reason : "";
  return { confidence, reply, matchedFaqId, reason };
}
