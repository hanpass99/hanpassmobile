import { createServerFn } from "@tanstack/react-start";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import { z } from "zod";

const InputSchema = z.object({
  texts: z.array(z.string().min(1).max(2000)).max(200),
  targetLang: z.enum(["en", "ko"]),
});

/**
 * Translate a batch of UI strings and cache results in `ui_translations`.
 * Returns a map { [sourceText]: translatedText } for the requested target language.
 * If translation fails, the source text is returned unchanged for that entry.
 */
export const translateBatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { texts, targetLang } = data;
    const uniq = Array.from(new Set(texts.map((t) => t.trim()).filter(Boolean)));
    if (uniq.length === 0) return {} as Record<string, string>;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Load existing cache
    const { data: cached } = await supabaseAdmin
      .from("ui_translations")
      .select("source_text, translated_text")
      .eq("target_lang", targetLang)
      .in("source_text", uniq);

    const result: Record<string, string> = {};
    for (const row of cached ?? []) {
      result[row.source_text as string] = row.translated_text as string;
    }

    const missing = uniq.filter((t) => !(t in result));
    if (missing.length === 0) return result;

    // 2. Translate missing via Lovable AI (single JSON call)
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      // No key — return source as fallback
      for (const t of missing) result[t] = t;
      return result;
    }

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const langName = targetLang === "en" ? "English" : "Korean";
      const prompt =
        `Translate each of the following UI strings to ${langName}. ` +
        `The source is UI text from a Korean CRM app for staff (customer service, telegram consultation, SLA, etc.). ` +
        `Preserve any placeholders like {name}, %s, or numbers. Keep the tone concise and professional. ` +
        `Return ONLY a JSON array of strings in the same order, no explanations, no markdown fences.\n\n` +
        `Input (JSON array):\n${JSON.stringify(missing)}`;

      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        prompt,
      });

      // Robust JSON parse
      const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed) || parsed.length !== missing.length) {
        throw new Error(`translation length mismatch (got ${Array.isArray(parsed) ? parsed.length : "?"} / ${missing.length})`);
      }

      const rows = missing.map((src, i) => {
        const translated = typeof parsed[i] === "string" && parsed[i].trim() ? parsed[i] : src;
        result[src] = translated;
        return {
          source_text: src,
          target_lang: targetLang,
          translated_text: translated,
        };
      });

      // 3. Upsert cache (best-effort)
      const { error } = await supabaseAdmin
        .from("ui_translations")
        .upsert(rows, { onConflict: "source_text,target_lang" });
      if (error) console.error("[auto-translate] cache upsert failed", error);
    } catch (err) {
      console.error("[auto-translate] batch translation failed", err);
      for (const t of missing) if (!(t in result)) result[t] = t;
    }

    return result;
  });
