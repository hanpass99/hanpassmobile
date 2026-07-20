import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Normalize a phone into common variants for matching.
function variants(input: string): string[] {
  const raw = input.trim();
  const digits = raw.replace(/[^\d]/g, "");
  const set = new Set<string>([raw, digits]);
  // strip 82 country prefix -> local 010...
  if (digits.startsWith("82")) set.add("0" + digits.slice(2));
  if (digits.startsWith("010")) {
    set.add("+82" + digits.slice(1));
    set.add("82" + digits.slice(1));
  }
  return Array.from(set).filter(Boolean);
}

export default defineTool({
  name: "search_customer_by_phone",
  title: "Search customer by phone",
  description: "Look up a customer by phone number. Matches common formats (010..., +82..., digits-only).",
  inputSchema: {
    phone: z.string().min(3).describe("Phone number in any common format."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ phone }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const candidates = variants(phone);
    const { data, error } = await sb
      .from("customers")
      .select("id, name, phone, status, pool, assigned_to, notes, updated_at")
      .in("phone", candidates)
      .limit(10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { matches: data ?? [] },
    };
  },
});
