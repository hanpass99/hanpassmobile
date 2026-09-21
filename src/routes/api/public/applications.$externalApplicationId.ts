/**
 * GET /api/public/applications/{externalApplicationId} — status lookup (DRAFT).
 *
 * Fail-closed: disabled unless PARTNER_API_ENABLED === "true" AND the
 * X-API-Key resolves to a partner. Results are partner-scoped; an application
 * belonging to another partner returns 404 so existence is never revealed.
 *
 * The response carries the APPLICATION status only. It never returns the
 * linked customer's status, name, phone, notes or any other internal data.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  integrationEnabled,
  newRequestId,
  resolvePartnerId,
  type StatusResponse,
} from "@/lib/partner-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  "Access-Control-Max-Age": "86400",
} as const;

const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders } as const;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export const Route = createFileRoute("/api/public/applications/$externalApplicationId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request, params }) => {
        const requestId = newRequestId();

        if (!integrationEnabled(process.env.PARTNER_API_ENABLED)) {
          return json({ error: "integration_disabled", requestId }, 503);
        }

        const partnerId = resolvePartnerId(
          process.env.PARTNER_API_KEYS,
          request.headers.get("x-api-key")
        );
        if (!partnerId) return json({ error: "unauthorized", requestId }, 401);

        const externalApplicationId = (params.externalApplicationId ?? "").trim();
        if (!externalApplicationId || externalApplicationId.length > 80) {
          return json({ error: "invalid_request", requestId }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rpc = supabaseAdmin.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message: string } | null }>;

        const { data, error } = await rpc("partner_get_application", {
          _partner_id: partnerId,
          _external_application_id: externalApplicationId,
        });

        if (error) {
          console.error(`[partner-api] lookup failed requestId=${requestId}`);
          return json({ error: "internal_error", requestId }, 500);
        }

        const row = data as {
          application_id?: string;
          external_application_id?: string;
          status?: string;
          received_at?: string;
        } | null;

        if (!row || !row.application_id) {
          return json({ error: "not_found", requestId }, 404);
        }

        const payload: StatusResponse = {
          applicationId: row.application_id,
          externalApplicationId: row.external_application_id!,
          status: row.status!,
          receivedAt: row.received_at!,
          requestId,
        };
        return json(payload, 200);
      },
    },
  },
});
