/**
 * POST /api/public/applications — partner application intake (DRAFT).
 *
 * Fail-closed by design:
 *   1. PARTNER_API_ENABLED must be exactly "true", otherwise 503 and NO
 *      database module is imported, read or written.
 *   2. A valid X-API-Key must resolve to a partner id, otherwise 401.
 * Only after both checks does any database code load.
 *
 * The supporting SQL lives in docs/sql/partner-applications-draft.sql and is
 * NOT applied, so this endpoint stays inert until that is approved separately.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  MAX_BODY_BYTES,
  applicationRequestSchema,
  buildFullName,
  buildProductSnapshot,
  integrationEnabled,
  newRequestId,
  normalizePhone,
  requestHash,
  resolvePartnerId,
  safeIssues,
  type ApplicationResponse,
} from "@/lib/partner-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Idempotency-Key",
  "Access-Control-Max-Age": "86400",
} as const;

const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders } as const;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/** Error responses never echo submitted values — only codes and field paths. */
function fail(error: string, requestId: string, status: number, details?: unknown) {
  return json(details === undefined ? { error, requestId } : { error, requestId, details }, status);
}

export const Route = createFileRoute("/api/public/applications")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const requestId = newRequestId();

        // ---- 1. Feature flag (fail-closed, no DB touched) ----------------
        if (!integrationEnabled(process.env.PARTNER_API_ENABLED)) {
          return fail("integration_disabled", requestId, 503);
        }

        // ---- 2. Partner authentication -----------------------------------
        const partnerId = resolvePartnerId(
          process.env.PARTNER_API_KEYS,
          request.headers.get("x-api-key")
        );
        if (!partnerId) return fail("unauthorized", requestId, 401);

        // ---- 3. Idempotency key ------------------------------------------
        const idempotencyKey = (request.headers.get("idempotency-key") ?? "").trim();
        if (!idempotencyKey || idempotencyKey.length > 120) {
          return fail("idempotency_key_required", requestId, 400);
        }

        // ---- 4. Body size + parse ----------------------------------------
        const rawText = await request.text();
        if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
          return fail("payload_too_large", requestId, 413);
        }
        let body: unknown;
        try {
          body = JSON.parse(rawText);
        } catch {
          return fail("invalid_json", requestId, 400);
        }

        // ---- 5. Contract validation --------------------------------------
        const parsed = applicationRequestSchema.safeParse(body);
        if (!parsed.success) {
          return fail("invalid_payload", requestId, 400, safeIssues(parsed.error));
        }
        const data = parsed.data;

        const phone = normalizePhone(data.applicant.phone);
        if (!phone) {
          return fail("invalid_payload", requestId, 400, [
            { field: "applicant.phone", message: "unsupported phone format" },
          ]);
        }
        const fullName = buildFullName(data.applicant);
        const hash = await requestHash(data);

        // ---- 6. Atomic submit (single transaction inside the RPC) --------
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rpc = supabaseAdmin.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message: string } | null }>;

        const { data: result, error } = await rpc("partner_submit_application", {
          _partner_id: partnerId,
          _external_application_id: data.externalApplicationId,
          _idempotency_key: idempotencyKey,
          _request_hash: hash,
          _full_name: fullName,
          _phone: phone,
          _nationality: data.applicant.nationality,
          _locale: data.locale,
          _source: data.source,
          _product_snapshot: buildProductSnapshot(data),
          _consent_version: data.consent.version,
          _consent_accepted_at: data.consent.acceptedAt,
          _submitted_at: data.submittedAt,
        });

        if (error) {
          // Log a correlation id only — never the payload, key or customer data.
          console.error(`[partner-api] submit failed requestId=${requestId}`);
          return fail("internal_error", requestId, 500);
        }

        const out = result as {
          outcome: "created" | "replayed" | "conflict";
          reason?: string;
          application_id?: string;
          external_application_id?: string;
          status?: string;
          received_at?: string;
        } | null;

        if (!out) return fail("internal_error", requestId, 500);

        if (out.outcome === "conflict") {
          return fail(out.reason ?? "conflict", requestId, 409);
        }

        const payload: ApplicationResponse = {
          applicationId: out.application_id!,
          externalApplicationId: out.external_application_id!,
          result: out.outcome,
          status: out.status!,
          receivedAt: out.received_at!,
          requestId,
        };
        return json(payload, out.outcome === "created" ? 201 : 200);
      },
    },
  },
});
