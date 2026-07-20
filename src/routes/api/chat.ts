import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

async function logChat(sb: Sb, userId: string, sessionId: string, entry: {
  role: "user" | "assistant" | "tool";
  content?: string | null;
  tool_name?: string | null;
  tool_input?: unknown;
  tool_output?: unknown;
}) {
  try {
    await sb.from("ai_chat_logs").insert({
      user_id: userId,
      session_id: sessionId,
      role: entry.role,
      content: entry.content ?? null,
      tool_name: entry.tool_name ?? null,
      tool_input: (entry.tool_input as never) ?? null,
      tool_output: (entry.tool_output as never) ?? null,
    });
  } catch (e) {
    console.error("[ai chat log] insert failed", e);
  }
}

function buildTools(sb: Sb, userId: string, sessionId: string) {
  const wrap = <I, O>(
    name: string,
    exec: (input: I) => Promise<O>,
  ) => async (input: I) => {
    const output = await exec(input);
    await logChat(sb, userId, sessionId, {
      role: "tool",
      tool_name: name,
      tool_input: input as unknown,
      tool_output: output as unknown,
    });
    return output;
  };

  return {
    search_customers: tool({
      description:
        "Search customers by name or phone (partial match). Returns up to 20 rows the signed-in user can see.",
      inputSchema: z.object({
        query: z.string().describe("Name or phone fragment"),
      }),
      execute: wrap("search_customers", async ({ query }: { query: string }) => {
        const q = query.trim();
        const { data, error } = await sb
          .from("customers")
          .select("id,name,phone,status,pool,country,assigned_to,updated_at")
          .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
          .order("updated_at", { ascending: false })
          .limit(20);
        if (error) return { error: error.message };
        return { customers: data ?? [] };
      }),
    }),

    get_customer_detail: tool({
      description: "Get one customer's full detail, notes, and recent call history.",
      inputSchema: z.object({ customer_id: z.string().uuid() }),
      execute: wrap("get_customer_detail", async ({ customer_id }: { customer_id: string }) => {
        const [{ data: cust }, { data: notes }, { data: calls }] = await Promise.all([
          sb.from("customers").select("*").eq("id", customer_id).maybeSingle(),
          sb.from("customer_notes").select("id,content,author_id,created_at").eq("customer_id", customer_id).order("created_at", { ascending: false }).limit(20),
          sb.from("phone_call_logs").select("id,direction,status,duration_sec,started_at,employee_phone,customer_phone").eq("customer_id", customer_id).order("started_at", { ascending: false }).limit(20),
        ]);
        return { customer: cust, notes: notes ?? [], calls: calls ?? [] };
      }),
    }),

    find_customers_by_status: tool({
      description: "List customers filtered by status (e.g. no_answer, activated, certificate_issuing).",
      inputSchema: z.object({
        status: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: wrap("find_customers_by_status", async ({ status, limit }: { status: string; limit?: number }) => {
        const { data, error } = await sb
          .from("customers")
          .select("id,name,phone,status,pool,country,updated_at")
          .eq("status", status as never)
          .order("updated_at", { ascending: false })
          .limit(limit ?? 20);
        if (error) return { error: error.message };
        return { customers: data ?? [] };
      }),
    }),

    today_call_stats: tool({
      description: "Today's call statistics for the signed-in user (or all staff if admin).",
      inputSchema: z.object({}),
      execute: wrap("today_call_stats", async () => {
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + kstOffset);
        const kstMidnight = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
        const startUtc = new Date(kstMidnight.getTime() - kstOffset).toISOString();
        const { data, error } = await sb
          .from("phone_call_logs")
          .select("status, staff_id, duration_sec")
          .gte("started_at", startUtc);
        if (error) return { error: error.message };
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        let total = 0;
        let totalDuration = 0;
        for (const r of rows) {
          total++;
          totalDuration += r.duration_sec ?? 0;
          byStatus[r.status ?? "unknown"] = (byStatus[r.status ?? "unknown"] ?? 0) + 1;
        }
        return { total, totalDuration, byStatus };
      }),
    }),

    add_customer_note: tool({
      description:
        "Append a note to a customer. Only call after the user explicitly confirms the note text and customer.",
      inputSchema: z.object({
        customer_id: z.string().uuid(),
        content: z.string().min(1),
      }),
      execute: wrap("add_customer_note", async ({ customer_id, content }: { customer_id: string; content: string }) => {
        const { data, error } = await sb
          .from("customer_notes")
          .insert({ customer_id, content, author_id: userId })
          .select()
          .maybeSingle();
        if (error) return { error: error.message };
        return { note: data };
      }),
    }),

    update_customer_status: tool({
      description:
        "Change a customer's status. IMPORTANT: only call after the user explicitly confirms both the customer and the new status.",
      inputSchema: z.object({
        customer_id: z.string().uuid(),
        status: z.string(),
      }),
      execute: wrap("update_customer_status", async ({ customer_id, status }: { customer_id: string; status: string }) => {
        const { data, error } = await sb.rpc("staff_update_customer_basic", {
          p_customer_id: customer_id,
          p_status: status,
        } as never);
        if (error) return { error: error.message };
        return { ok: true, result: data };
      }),
    }),

    daily_work_report: tool({
      description: "Build a daily work report summary for the signed-in user for a given date (default today, KST).",
      inputSchema: z.object({ date: z.string().optional().describe("YYYY-MM-DD in KST") }),
      execute: wrap("daily_work_report", async ({ date }: { date?: string }) => {
        const day = date ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        const startUtc = new Date(`${day}T00:00:00+09:00`).toISOString();
        const endUtc = new Date(`${day}T23:59:59.999+09:00`).toISOString();
        const [{ data: calls }, { data: notes }] = await Promise.all([
          sb.from("phone_call_logs").select("status,duration_sec,customer_id").gte("started_at", startUtc).lte("started_at", endUtc),
          sb.from("customer_notes").select("id,customer_id,content,created_at").gte("created_at", startUtc).lte("created_at", endUtc),
        ]);
        const c = calls ?? [];
        const byStatus: Record<string, number> = {};
        let dur = 0;
        for (const r of c) {
          dur += r.duration_sec ?? 0;
          byStatus[r.status ?? "unknown"] = (byStatus[r.status ?? "unknown"] ?? 0) + 1;
        }
        return {
          date: day,
          calls: { total: c.length, totalDuration: dur, byStatus },
          notesAdded: (notes ?? []).length,
        };
      }),
    }),
  };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !LOVABLE_API_KEY) {
          return new Response("Server not configured", { status: 500 });
        }

        const sb: Sb = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: claims, error: cErr } = await sb.auth.getClaims(token);
        if (cErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub as string;

        let body: { messages?: UIMessage[]; sessionId?: string };
        try {
          body = (await request.json()) as { messages?: UIMessage[]; sessionId?: string };
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        const messages = body.messages ?? [];
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("Messages required", { status: 400 });
        }
        const sessionId = body.sessionId ?? crypto.randomUUID();

        // Log the most recent user message
        const last = messages[messages.length - 1];
        if (last?.role === "user") {
          const text = (last.parts ?? [])
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("")
            .trim();
          if (text) {
            await logChat(sb, userId, sessionId, { role: "user", content: text });
          }
        }

        const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
        const model = gateway("google/gemini-3.5-flash");

        const systemPrompt = `You are the AI assistant for the Hanpass Mobile Outbound CRM used by call-center staff.

Rules:
- Detect the user's language (Korean, English, Uzbek, or Russian) and always reply in that language.
- Use the provided tools to look up real CRM data — never invent customers, statuses, or call numbers.
- Row-level security applies: tools will only return rows the signed-in employee is allowed to see. If a tool returns nothing, tell the user plainly.
- Before ANY action that writes data (update_customer_status, add_customer_note), first restate exactly what you are about to do and ask the user to confirm with "네/yes/ha/да". Only call the tool after the user confirms.
- Format results as short readable summaries with key fields (name, phone, status). Prefer bullet lists over long paragraphs.
- Keep answers concise and mobile-friendly.

The signed-in employee user id is: ${userId}. Current time (UTC): ${new Date().toISOString()}.`;

        const modelMessages = await convertToModelMessages(messages);

        const result = streamText({
          model,
          system: systemPrompt,
          messages: modelMessages,
          tools: buildTools(sb, userId, sessionId),
          stopWhen: stepCountIs(12),
          onFinish: async ({ text }) => {
            if (text?.trim()) {
              await logChat(sb, userId, sessionId, { role: "assistant", content: text });
            }
          },
        });

        return result.toTextStreamResponse({
          headers: { "x-session-id": sessionId },
        });
      },
    },
  },
});
