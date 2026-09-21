/**
 * POST /api/public/applications — partner application intake (append-only).
 *
 * Storage model: this back office keeps NO application ledger. The ledger,
 * the original payload, idempotency records and every failed/needs-review case
 * live in the partner's own encrypted store (Railway). `public.customers` only
 * ever receives the operational copy of a NEW application.
 *
 * Database contract of this route — nothing else is permitted:
 *   - SELECT on public.customers (by derived id only) and public.countries
 *   - a single INSERT of one new customers row
 * No UPDATE, no DELETE, no upsert, no ON CONFLICT, no DDL. Rows created by the
 * existing triggers (status history) are the only additional writes.
 *
 * Fail-closed: PARTNER_API_ENABLED must be exactly "true" and X-API-Key must
 * resolve to a partner before any database module is imported.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  applicationRequestSchema,
  buildHashPayload,
  buildFullName,
  buildNotes,
  deriveCustomerId,
  encodeMarker,
  integrationEnabled,
  isJsonContentType,
  kstDate,
  mapCustomerStatus,
  markerMatches,
  newRequestId,
  normalizePhone,
  parseMarker,
  readLimitedText,
  requestHash,
  resolvePartnerId,
  safeIssues,
  UNKNOWN_NATIONALITY,
  type ApplicationResponse,
  type MarkerPayload,
} from "@/lib/partner-api";

/** Server-to-server only: no CORS allowance, never cached. */
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
} as const;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/** Error responses never echo submitted values — only codes and field paths. */
function fail(error: string, requestId: string, status: number, details?: unknown) {
  return json(details === undefined ? { error, requestId } : { error, requestId, details }, status);
}

type CustomerRow = { id: string; notes: string | null; status: string | null; created_at: string };

export const Route = createFileRoute("/api/public/applications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        try {
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

          // ---- 3. Content type, then a size-capped streaming read ----------
          if (!isJsonContentType(request.headers.get("content-type"))) {
            return fail("unsupported_media_type", requestId, 415);
          }
          const read = await readLimitedText(request);
          if (!read.ok) return fail("payload_too_large", requestId, 413);

          let body: unknown;
          try {
            body = JSON.parse(read.text);
          } catch {
            return fail("invalid_json", requestId, 400);
          }

          // ---- 4. Contract validation --------------------------------------
          const parsed = applicationRequestSchema.safeParse(body);
          if (!parsed.success) {
            return fail("invalid_payload", requestId, 400, safeIssues(parsed.error));
          }
          const data = parsed.data;

          // The external application id IS the idempotency key for this API.
          const idempotencyKey = (request.headers.get("idempotency-key") ?? "").trim();
          if (!idempotencyKey) return fail("idempotency_key_required", requestId, 400);
          if (idempotencyKey.toLowerCase() !== data.externalApplicationId.toLowerCase()) {
            return fail("idempotency_key_mismatch", requestId, 400);
          }

          const phone = normalizePhone(data.applicant.phone);
          if (!phone) {
            return fail("invalid_payload", requestId, 400, [
              { field: "applicant.phone", message: "unsupported phone format" },
            ]);
          }

          // ---- 5. Derived identity + marker --------------------------------
          const hash = await requestHash(buildHashPayload(data, phone));
          const customerId = await deriveCustomerId(partnerId, data.externalApplicationId);
          const expected: MarkerPayload = {
            partnerId,
            externalApplicationId: data.externalApplicationId,
            idempotencyKey: data.externalApplicationId,
            requestHash: hash,
          };
          const marker = encodeMarker(expected);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const selectDerived = async () => {
            const { data: row, error } = await supabaseAdmin
              .from("customers")
              .select("id, notes, status, created_at")
              .eq("id", customerId)
              .maybeSingle();
            if (error) throw new Error("select_failed");
            return (row as CustomerRow | null) ?? null;
          };

          const replayOrConflict = (row: CustomerRow) => {
            // Extra integrity check only — the API key already authenticated.
            if (!markerMatches(parseMarker(row.notes), expected)) {
              // A missing or edited marker is never repaired, rewritten or
              // overwritten. The request is refused instead.
              return fail("marker_mismatch", requestId, 409);
            }
            const payload: ApplicationResponse = {
              applicationId: row.id,
              externalApplicationId: data.externalApplicationId,
              result: "replayed",
              status: mapCustomerStatus(row.status),
              receivedAt: row.created_at,
              requestId,
            };
            return json(payload, 200);
          };

          // ---- 6. Replay check on the derived id ---------------------------
          const existing = await selectDerived();
          if (existing) return replayOrConflict(existing);

          // ---- 7. Country lookup (exact code match, read-only) -------------
          let countryId: string | null = null;
          if (data.applicant.nationality !== UNKNOWN_NATIONALITY) {
            const { data: country, error: countryErr } = await supabaseAdmin
              .from("countries")
              .select("id")
              .eq("code", data.applicant.nationality)
              .maybeSingle();
            if (countryErr) throw new Error("country_lookup_failed");
            countryId = (country as { id: string } | null)?.id ?? null;
          }

          // ---- 8. Single INSERT of the operational copy --------------------
          const day = kstDate(data.submittedAt);
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from("customers")
            .insert({
              id: customerId,
              name: buildFullName(data.applicant),
              phone,
              pool: "activation_request",
              status: "new",
              application_date: day,
              signup_date: day,
              requested_plan: data.product.name,
              monthly_fee: data.product.monthlyFee,
              customer_type: data.product.type,
              country_id: countryId,
              assigned_to: null,
              call_round: null,
              notes: buildNotes(data, marker),
            })
            .select("id, notes, status, created_at")
            .single();

          if (insertErr) {
            const code = (insertErr as { code?: string }).code ?? "";
            if (code === "23505") {
              // Either our own row won a concurrent race (PK) or an unrelated
              // existing row collides on a dedup index. Only the derived id is
              // ever looked up again; no other row is inspected or linked.
              const raced = await selectDerived();
              if (raced) return replayOrConflict(raced);
              return fail("customer_duplicate", requestId, 409);
            }
            console.error(`[partner-api] insert failed requestId=${requestId}`);
            return fail("internal_error", requestId, 500);
          }

          const row = inserted as unknown as CustomerRow;
          const payload: ApplicationResponse = {
            applicationId: row.id,
            externalApplicationId: data.externalApplicationId,
            result: "created",
            status: mapCustomerStatus(row.status),
            receivedAt: row.created_at,
            requestId,
          };
          return json(payload, 201);
        } catch {
          // Generic, PII-free failure. The exception itself is not echoed.
          console.error(`[partner-api] unhandled submit error requestId=${requestId}`);
          return fail("internal_error", requestId, 500);
        }
      },
    },
  },
});
