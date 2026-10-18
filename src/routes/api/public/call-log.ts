import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { constantTimeTokenEqual, normalizePhone, uniquePhoneMatch } from "@/lib/ingestion-security";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Automate-Token",
  "Access-Control-Max-Age": "86400",
} as const;

const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

const payloadSchema = z.object({
  employee_phone: z.string().min(4).max(32),
  customer_phone: z.string().max(32).optional().nullable(),
  direction: z.string().min(1).max(32),
  status: z.string().max(32).optional().nullable(),
  duration: z.union([z.number(), z.string()]).optional().nullable(),
  started_at: z.string().optional().nullable(),
});

/** Normalize direction into incoming | outgoing | missed. */
function normalizeDirection(raw: string, status: string | null | undefined): string {
  const d = raw.toLowerCase().trim();
  if (["missed", "no_answer", "noanswer", "rejected", "declined"].includes(d)) return "missed";
  if (["in", "incoming", "inbound", "received"].includes(d)) {
    const s = (status ?? "").toLowerCase();
    if (["missed", "no_answer", "rejected", "declined"].includes(s)) return "missed";
    return "incoming";
  }
  if (["out", "outgoing", "outbound", "dialed"].includes(d)) return "outgoing";
  return "outgoing";
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Parse started_at. Supports ISO with offset (yyyy-MM-dd'T'HH:mm:ssZ) and
 * offset-less local timestamps, which are assumed to be KST (+09:00).
 */
function parseStartedAt(raw: string | null | undefined): { iso: string; ok: boolean } {
  if (!raw) return { iso: new Date().toISOString(), ok: false };
  const s = raw.trim();
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (hasOffset) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return { iso: d.toISOString(), ok: true };
  }
  // "yyyy-MM-dd HH:mm:ss" or "yyyy-MM-ddTHH:mm:ss" without offset -> treat as KST
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
    return { iso: new Date(utcMs - KST_OFFSET_MS).toISOString(), ok: true };
  }
  const epoch = Number(s);
  if (Number.isFinite(epoch) && epoch > 1e9) {
    return { iso: new Date(epoch < 1e12 ? epoch * 1000 : epoch).toISOString(), ok: true };
  }
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return { iso: fallback.toISOString(), ok: true };
  return { iso: new Date().toISOString(), ok: false };
}

export const Route = createFileRoute("/api/public/call-log")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const token = process.env.AUTOMATE_WEBHOOK_TOKEN;
        const authHeader = request.headers.get("authorization") ?? "";
        const bearer = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        const provided = request.headers.get("x-automate-token") ?? bearer;
        if (!token || !constantTimeTokenEqual(provided, token)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rawText = await request.text();

        let body: unknown;
        try {
          body = JSON.parse(rawText);
        } catch {
          await supabaseAdmin.from("call_log_ingest").insert({
            raw_body: { _unparsed: rawText.slice(0, 4000) } as any,
            parse_ok: false,
            error_reason: "invalid_json",
          });
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          const { data: ing } = await supabaseAdmin
            .from("call_log_ingest")
            .insert({
              raw_body: body as any,
              parse_ok: false,
              error_reason: `invalid_payload: ${JSON.stringify(parsed.error.flatten().fieldErrors).slice(0, 300)}`,
            })
            .select("id")
            .maybeSingle();
          return new Response(
            JSON.stringify({ error: "invalid_payload", ingest_id: ing?.id ?? null, details: parsed.error.flatten() }),
            { status: 400, headers: jsonHeaders }
          );
        }
        const data = parsed.data;
        const empPhone = normalizePhone(data.employee_phone);
        const custPhone = normalizePhone(data.customer_phone ?? null);
        const durationRaw = Number(data.duration ?? 0);
        const duration = Number.isFinite(durationRaw) ? Math.max(0, Math.round(durationRaw)) : 0;
        const { iso: startedIso } = parseStartedAt(data.started_at);
        const direction = normalizeDirection(data.direction, data.status);

        let staffId: string | null = null;
        if (empPhone) {
          const { data: profiles, error: lookupError } = await supabaseAdmin
            .from("profiles").select("id").eq("phone_digits", empPhone).limit(2);
          if (lookupError) return Response.json({ error: "employee_lookup_failed" }, { status: 500, headers: corsHeaders });
          staffId = uniquePhoneMatch(profiles).id;
        }

        let customerId: string | null = null;
        let ambiguousCustomer = false;
        if (custPhone) {
          const { data: customers, error: lookupError } = await supabaseAdmin
            .from("customers").select("id").eq("phone_digits", custPhone).limit(2);
          if (lookupError) return Response.json({ error: "customer_lookup_failed" }, { status: 500, headers: corsHeaders });
          const match = uniquePhoneMatch(customers);
          customerId = match.id;
          ambiguousCustomer = match.ambiguous;
        }

        const { data: inserted, error } = await supabaseAdmin
          .from("phone_call_logs" as any)
          .insert({
            staff_id: staffId,
            employee_phone: empPhone ?? data.employee_phone,
            customer_phone: custPhone,
            customer_id: customerId,
            direction,
            status: data.status ?? null,
            duration_sec: duration,
            started_at: startedIso,
            raw: body as any,
          })
          .select("id")
          .maybeSingle();

        const ingestRow = {
          raw_body: body as any,
          employee_phone: empPhone,
          customer_phone: custPhone,
          direction,
          status: data.status ?? null,
          duration,
          started_at: startedIso,
          parse_ok: !error,
          error_reason: error
            ? `insert_failed: ${error.message}`
            : ambiguousCustomer
              ? "ambiguous_customer"
              : staffId
              ? null
              : "employee_not_matched",
          matched_employee_id: staffId,
          matched_customer_id: customerId,
          phone_call_log_id: (inserted as any)?.id ?? null,
        };
        const { data: ing } = await supabaseAdmin
          .from("call_log_ingest")
          .insert(ingestRow as any)
          .select("id")
          .maybeSingle();

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message, ingest_id: ing?.id ?? null }),
            { status: 500, headers: jsonHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            id: (inserted as any)?.id ?? null,
            ingest_id: ing?.id ?? null,
            started_at: startedIso,
            direction,
            matched_staff: !!staffId,
            matched_customer: !!customerId,
          }),
          { status: 200, headers: jsonHeaders }
        );
      },
    },
  },
});
