import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: unknown, userId: string) {
  const client = supabase as { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> };
  const { data } = await client.rpc("has_role", { _user_id: userId, _role: "admin" } as never);
  if (!data) throw new Error("Admin only");
}

async function embedForFaq(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  try {
    const { embedText } = await import("@/lib/ai-reply.server");
    return await embedText(text);
  } catch (e) {
    console.error("[ai-faq] embedding failed", e);
    return null;
  }
}

export const listAiFaqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_faq_entries")
      .select("id, category, question_examples, answer_uz, answer_ru, is_active, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { faqs: data ?? [] };
  });

export const upsertAiFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional().nullable(),
        category: z.string().max(60).optional().nullable(),
        question_examples: z.array(z.string().min(1).max(500)).min(1).max(20),
        answer_uz: z.string().min(1).max(2000),
        answer_ru: z.string().min(1).max(2000),
        is_active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const embeddingText = data.question_examples.join("\n");
    const embedding = await embedForFaq(embeddingText);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      category: data.category ?? null,
      question_examples: data.question_examples,
      answer_uz: data.answer_uz,
      answer_ru: data.answer_ru,
      is_active: data.is_active,
      embedding: embedding as never,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("ai_faq_entries")
        .update(payload as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("ai_faq_entries")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const deleteAiFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("ai_faq_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// AI reply settings (global + per-chat)
export const getAiReplySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chatRowId: z.string().uuid().optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_reply_settings")
      .select("id, scope, chat_row_id, enabled, confidence_threshold");
    if (error) throw new Error(error.message);
    const global = (rows ?? []).find((r) => r.scope === "global") ?? {
      enabled: true,
      confidence_threshold: 0.75,
    };
    const chat = data.chatRowId
      ? (rows ?? []).find((r) => r.scope === "chat" && r.chat_row_id === data.chatRowId)
      : null;
    return { global, chat: chat ?? null };
  });

export const setAiReplyGlobalEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_reply_settings")
      .update({ enabled: data.enabled })
      .eq("scope", "global");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAiReplyChatEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ chatRowId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_reply_settings")
      .upsert(
        {
          scope: "chat",
          chat_row_id: data.chatRowId,
          enabled: data.enabled,
        } as never,
        { onConflict: "scope,chat_row_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Auto-detected FAQ candidates (from real operator replies) --------------

export const listAiFaqCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_faq_candidates")
      .select("id, category, question_examples, answer_uz, answer_ru, occurrences, status, created_at")
      .eq("status", "pending")
      .order("occurrences", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { candidates: data ?? [] };
  });

// Approve a candidate → create an active FAQ entry (with embedding).
export const approveAiFaqCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: c, error } = await context.supabase
      .from("ai_faq_candidates")
      .select("id, category, question_examples, answer_uz, answer_ru")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !c) throw new Error("Candidate not found");

    const embedding = await embedForFaq((c.question_examples ?? []).join("\n"));
    const { data: inserted, error: insErr } = await context.supabase
      .from("ai_faq_entries")
      .insert({
        category: c.category,
        question_examples: c.question_examples,
        answer_uz: c.answer_uz,
        answer_ru: c.answer_ru,
        is_active: true,
        source: "auto",
        created_by: context.userId,
        embedding: embedding as never,
      } as never)
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    await context.supabase
      .from("ai_faq_candidates")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        promoted_faq_id: (inserted as { id: string }).id,
      } as never)
      .eq("id", data.id);
    return { ok: true };
  });

export const rejectAiFaqCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("ai_faq_candidates")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
