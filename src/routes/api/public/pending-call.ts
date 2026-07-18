import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Automate-Token",
  "Access-Control-Max-Age": "86400",
} as const;

const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("82") && digits.length >= 11) return "0" + digits.slice(2);
  return digits;
}

/**
 * Automate app on the employee's phone polls this every few seconds.
 *   GET /api/public/pending-call?employee_phone=01012345678
 *   Headers: X-Automate-Token: <AUTOMATE_WEBHOOK_TOKEN>
 *
 * Response:
 *   200 { target_phone: "010..." }  → Automate dials it
 *   204 (no content)                → nothing to dial
 */
export const Route = createFileRoute("/api/public/pending-call")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const token = process.env.AUTOMATE_WEBHOOK_TOKEN;
        const authHeader = request.headers.get("authorization") ?? "";
        const bearer = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        const provided = request.headers.get("x-automate-token") ?? bearer;
        if (!token || provided !== token) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        const url = new URL(request.url);
        const empPhone = normalizePhone(url.searchParams.get("employee_phone"));
        if (!empPhone) {
          return new Response(JSON.stringify({ error: "missing_employee_phone" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Grab the oldest unconsumed call and mark it consumed atomically-ish.
        const { data: rows, error } = await supabaseAdmin
          .from("pending_calls" as any)
          .select("id, target_phone, created_at")
          .eq("employee_phone", empPhone)
          .is("consumed_at", null)
          // Ignore stale requests older than 2 minutes
          .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
          .order("created_at", { ascending: true })
          .limit(1);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: jsonHeaders,
          });
        }

        const row = rows?.[0] as { id: string; target_phone: string } | undefined;
        if (!row) {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        await supabaseAdmin
          .from("pending_calls" as any)
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", row.id);

        return new Response(
          JSON.stringify({ target_phone: row.target_phone }),
          { status: 200, headers: jsonHeaders }
        );
      },
    },
  },
});
