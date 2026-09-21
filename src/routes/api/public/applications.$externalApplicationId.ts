/**
 * GET /api/public/applications/{externalApplicationId} — status lookup.
 *
 * Read-only. The path segment is the partner's own UUID v4; the customer id is
 * always RE-DERIVED server-side from (partnerId, externalApplicationId), so a
 * caller can never supply a customer id or look up an arbitrary row.
 *
 * The response carries the mapped application status and timestamps only —
 * never a name, phone number, notes or any other stored field.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  deriveCustomerId,
  integrationEnabled,
  isUuidV4,
  mapCustomerStatus,
  markerScopeMatches,
  newRequestId,
  parseMarker,
  resolvePartnerId,
  type StatusResponse,
} from "@/lib/partner-api";

/** Server-to-server only: no CORS allowance, never cached. */
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
} as const;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export const Route = createFileRoute("/api/public/applications/$externalApplicationId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestId = newRequestId();
        try {
          if (!integrationEnabled(process.env.PARTNER_API_ENABLED)) {
            return json({ error: "integration_disabled", requestId }, 503);
          }

          const partnerId = resolvePartnerId(
            process.env.PARTNER_API_KEYS,
            request.headers.get("x-api-key")
          );
          if (!partnerId) return json({ error: "unauthorized", requestId }, 401);

          const externalApplicationId = (params.externalApplicationId ?? "").trim().toLowerCase();
          if (!isUuidV4(externalApplicationId)) {
            return json({ error: "invalid_request", requestId }, 400);
          }

          const customerId = await deriveCustomerId(partnerId, externalApplicationId);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("customers")
            .select("id, notes, status, created_at")
            .eq("id", customerId)
            .maybeSingle();

          if (error) {
            console.error(`[partner-api] lookup failed requestId=${requestId}`);
            return json({ error: "internal_error", requestId }, 500);
          }

          const row = data as {
            id: string;
            notes: string | null;
            status: string | null;
            created_at: string;
          } | null;

          // Fail-closed: no row, or a missing/edited/foreign marker, is a 404.
          // Existence of somebody else's row is never revealed, and a damaged
          // marker is never repaired.
          if (!row || !markerScopeMatches(parseMarker(row.notes), partnerId, externalApplicationId)) {
            return json({ error: "not_found", requestId }, 404);
          }

          const payload: StatusResponse = {
            applicationId: row.id,
            externalApplicationId,
            status: mapCustomerStatus(row.status),
            receivedAt: row.created_at,
            requestId,
          };
          return json(payload, 200);
        } catch {
          console.error(`[partner-api] unhandled lookup error requestId=${requestId}`);
          return json({ error: "internal_error", requestId }, 500);
        }
      },
    },
  },
});
