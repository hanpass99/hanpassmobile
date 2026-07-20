import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_call_logs",
  title: "List my recent call logs",
  description:
    "List the signed-in user's most recent phone call logs (newest first). Admins see all logs their RLS allows.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
    since_iso: z
      .string()
      .optional()
      .describe("Only include calls started at or after this ISO timestamp (e.g. 2026-07-18T00:00:00+09:00)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, since_iso }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("phone_call_logs")
      .select(
        "id, started_at, direction, call_status, duration_sec, employee_phone, customer_phone, customer_id, memo",
      )
      .order("started_at", { ascending: false })
      .limit(limit ?? 50);
    if (since_iso) q = q.gte("started_at", since_iso);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { logs: data ?? [] },
    };
  },
});
