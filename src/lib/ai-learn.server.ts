// Server-only: automatic AI learning from real operator replies.
// Scans recent human (non-AI) operator answers to customer questions,
// synthesizes FAQ candidates, de-duplicates against the existing knowledge
// base, and stores new entries with embeddings.

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";
const CHAT_MODEL = "google/gemini-3.6-flash";

function getApiKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not configured");
  return k;
}

type Pair = { question: string; answer: string };

type Candidate = {
  category: string | null;
  question_examples: string[];
  answer_uz: string;
  answer_ru: string;
};

const SYNTH_PROMPT = `You are building a FAQ knowledge base for Hanpass Mobile customer support (Uzbek/Russian speaking customers in Korea).

You receive real customer question / human operator answer pairs from Telegram support chats.

Task: produce reusable, generic FAQ entries.

Hard rules:
- NEVER create an entry about prices, plan/tariff fees, data amounts (GB), discounts, promotions, refunds, or payment amounts. Those change monthly and must always be handled by a human. Drop such pairs entirely.
- Drop anything containing personal data (names, phone numbers, passport/ID numbers, addresses, order numbers) or one-off case-specific answers.
- Merge similar pairs into a single entry.
- Each entry must have 2-5 short question_examples in the original language(s) used by customers, plus a clear answer in BOTH Uzbek (answer_uz) and Russian (answer_ru), 1-3 sentences each, polite.
- Only include entries you are confident are generally true and repeatable.
- Output STRICT JSON: {"entries":[{"category": string|null, "question_examples": string[], "answer_uz": string, "answer_ru": string}]}
- If nothing qualifies, output {"entries":[]}. Maximum 8 entries.`;

export async function synthesizeCandidates(pairs: Pair[]): Promise<Candidate[]> {
  if (pairs.length === 0) return [];
  const block = pairs
    .map((p, i) => `#${i + 1}\nQ: ${p.question.slice(0, 400)}\nA: ${p.answer.slice(0, 600)}`)
    .join("\n\n");

  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": getApiKey(),
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYNTH_PROMPT },
        { role: "user", content: block },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FAQ synthesis failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  let parsed: { entries?: Candidate[] };
  try {
    parsed = JSON.parse(json.choices[0]?.message?.content ?? "{}");
  } catch {
    return [];
  }
  return (parsed.entries ?? []).filter(
    (e) =>
      Array.isArray(e.question_examples) &&
      e.question_examples.length > 0 &&
      typeof e.answer_uz === "string" &&
      e.answer_uz.trim().length > 0 &&
      typeof e.answer_ru === "string" &&
      e.answer_ru.trim().length > 0,
  );
}

export type LearnResult = {
  pairsAnalyzed: number;
  candidates: number;
  faqsAdded: number;
  windowFrom: string;
  windowTo: string;
};

// Main entry point. Uses the service-role client (passed in) so it can run
// from a cron endpoint without a user session.
export async function runAutoLearn(
  supabaseAdmin: any,
  opts: { triggerSource: string; maxPairs?: number },
): Promise<LearnResult> {
  const { containsSafetyKeyword, embedText } = await import("@/lib/ai-reply.server");
  const maxPairs = opts.maxPairs ?? 120;
  const windowTo = new Date().toISOString();

  // Determine the window start: last successful run, else 7 days ago.
  const { data: lastRun } = await supabaseAdmin
    .from("ai_learning_runs")
    .select("window_to")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const windowFrom =
    (lastRun as { window_to: string } | null)?.window_to ??
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: run } = await supabaseAdmin
    .from("ai_learning_runs")
    .insert({
      window_from: windowFrom,
      window_to: windowTo,
      trigger_source: opts.triggerSource,
    })
    .select("id")
    .single();
  const runId = (run as { id: string } | null)?.id ?? null;

  const finish = async (
    status: string,
    result: Omit<LearnResult, "windowFrom" | "windowTo">,
    error?: string,
  ) => {
    if (!runId) return;
    await supabaseAdmin
      .from("ai_learning_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        error: error ?? null,
        pairs_analyzed: result.pairsAnalyzed,
        candidates: result.candidates,
        faqs_added: result.faqsAdded,
      })
      .eq("id", runId);
  };

  try {
    // 1. Collect human operator replies in the window, with their chat context.
    const { data: outbound } = await supabaseAdmin
      .from("telegram_messages")
      .select("id, telegram_chat_row_id, text, created_at, sent_by, is_ai_generated, direction")
      .eq("direction", "out")
      .eq("is_ai_generated", false)
      .not("sent_by", "is", null)
      .not("text", "is", null)
      .gte("created_at", windowFrom)
      .lt("created_at", windowTo)
      .order("created_at", { ascending: true })
      .limit(400);

    const rows = (outbound ?? []) as Array<{
      telegram_chat_row_id: string;
      text: string;
      created_at: string;
    }>;

    const pairs: Pair[] = [];
    for (const r of rows) {
      if (pairs.length >= maxPairs) break;
      const answer = (r.text ?? "").trim();
      if (answer.length < 10 || answer.startsWith("🤖")) continue;
      // Find the customer message right before this reply in the same chat.
      const { data: prev } = await supabaseAdmin
        .from("telegram_messages")
        .select("text")
        .eq("telegram_chat_row_id", r.telegram_chat_row_id)
        .eq("direction", "in")
        .not("text", "is", null)
        .lt("created_at", r.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const question = ((prev as { text: string } | null)?.text ?? "").trim();
      if (question.length < 5) continue;
      // Skip anything about prices/plans/refunds — always human-only.
      if (containsSafetyKeyword(question) || containsSafetyKeyword(answer)) continue;
      pairs.push({ question, answer });
    }

    if (pairs.length === 0) {
      const res = { pairsAnalyzed: 0, candidates: 0, faqsAdded: 0 };
      await finish("success", res);
      return { ...res, windowFrom, windowTo };
    }

    // 2. Synthesize FAQ candidates in batches of 40 pairs.
    const candidates: Candidate[] = [];
    for (let i = 0; i < pairs.length; i += 40) {
      const batch = pairs.slice(i, i + 40);
      try {
        candidates.push(...(await synthesizeCandidates(batch)));
      } catch (e) {
        console.error("[ai-learn] synthesis batch failed", e);
      }
    }

    // 3. De-duplicate against the existing knowledge base and insert.
    let added = 0;
    for (const c of candidates) {
      const questionText = c.question_examples.join("\n");
      if (containsSafetyKeyword(questionText) || containsSafetyKeyword(c.answer_uz) || containsSafetyKeyword(c.answer_ru)) {
        continue;
      }
      let embedding: number[] = [];
      try {
        embedding = await embedText(questionText);
      } catch (e) {
        console.error("[ai-learn] embedding failed", e);
        continue;
      }
      if (embedding.length === 0) continue;

      const { data: matches } = await supabaseAdmin.rpc("match_ai_faq", {
        query_embedding: embedding as never,
        match_count: 1,
      });
      const top = (matches ?? [])[0] as { similarity: number } | undefined;
      if (top && top.similarity >= 0.9) continue; // already known

      const { error } = await supabaseAdmin.from("ai_faq_entries").insert({
        category: c.category ?? "자동학습",
        question_examples: c.question_examples.slice(0, 10),
        answer_uz: c.answer_uz.slice(0, 2000),
        answer_ru: c.answer_ru.slice(0, 2000),
        is_active: true,
        source: "auto",
        embedding: embedding as never,
      });
      if (!error) added += 1;
    }

    const res = { pairsAnalyzed: pairs.length, candidates: candidates.length, faqsAdded: added };
    await finish("success", res);
    return { ...res, windowFrom, windowTo };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("error", { pairsAnalyzed: 0, candidates: 0, faqsAdded: 0 }, msg);
    throw e;
  }
}
