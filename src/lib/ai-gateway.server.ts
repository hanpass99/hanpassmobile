// Server-only AI model resolution. Two routes:
//  - default: Lovable AI gateway (LOVABLE_API_KEY) — production behavior
//  - when GEMINI_API_KEY / OPENAI_API_KEY are set (AWS test copy): calls
//    Google Gemini / OpenAI directly, independent of the Lovable gateway.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_BASE = "https://api.openai.com/v1";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: GATEWAY_BASE,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

// ---- Model id mapping (gateway id -> provider-direct id) ----
export function directChatModelId(gatewayModelId: string): string {
  return process.env.AI_CHAT_MODEL || gatewayModelId.replace(/^google\//, "");
}

export function directEmbeddingModelId(gatewayModelId: string): string {
  return process.env.AI_EMBEDDING_MODEL || gatewayModelId.replace(/^openai\//, "");
}

export function hasDirectAiKeys(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

export function aiChatAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY);
}

export type ChatMessage = { role: "system" | "user"; content: string };

// Chat completion returning the assistant text. JSON-mode callers receive JSON text.
export async function chatCompletion(
  gatewayModelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const model = directChatModelId(gatewayModelId);
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: "user", parts: [{ text: m.content }] }));
    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini chat failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini chat returned no content");
    return text;
  }

  const gatewayKey = process.env.LOVABLE_API_KEY;
  if (!gatewayKey) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": gatewayKey },
    body: JSON.stringify({
      model: gatewayModelId,
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat completion failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices[0]?.message?.content ?? "{}";
}

export async function embedTextViaProvider(
  gatewayModelId: string,
  text: string,
): Promise<number[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const res = await fetch(`${OPENAI_BASE}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({ model: directEmbeddingModelId(gatewayModelId), input: text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data[0]?.embedding ?? [];
  }

  const gatewayKey = process.env.LOVABLE_API_KEY;
  if (!gatewayKey) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch(`${GATEWAY_BASE}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": gatewayKey },
    body: JSON.stringify({ model: gatewayModelId, input: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? [];
}

// AI SDK model resolution for streaming / tool-calling routes (in-app assistant).
export function resolveAiSdkModel(gatewayModelId: string) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return createGoogleGenerativeAI({ apiKey: geminiKey })(directChatModelId(gatewayModelId));
  }
  const gatewayKey = process.env.LOVABLE_API_KEY;
  if (!gatewayKey) throw new Error("LOVABLE_API_KEY is not configured");
  return createLovableAiGatewayProvider(gatewayKey)(gatewayModelId);
}
