import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

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

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  // Strip Korean country code (+82 / 0082)
  if (digits.startsWith("0082")) digits = digits.slice(4);
  if (digits.startsWith("82") && digits.length >= 11) digits = digits.slice(2);
  // Restore national leading zero for Korean mobile/landline
  if (!digits.startsWith("0") && /^(1[016789]|2|3[1-3]|4[1-4]|5[1-5]|6[1-4])/.test(digits)) {
    digits = "0" + digits;
  }
  return digits;
}

/** Comparable key: last 8 digits — immune to leading 0 / country code differences. */
function phoneKey(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return n.slice(-8);
}

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
        if (!token || provided !== token) {
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

        // Flexible employee matching: compare normalized last-8-digit keys
        let staffId: string | null = null;
        const empKey = phoneKey(data.employee_phone);
        if (empKey) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("id, phone")
            .not("phone", "is", null);
          staffId = (profs ?? []).find((p: any) => phoneKey(p.phone) === empKey)?.id ?? null;
        }


        let customerId: string | null = null;
        if (custPhone) {
          const variants = new Set<string>([custPhone]);
          // Korean mobile formatted variants
          if (/^01\d{8,9}$/.test(custPhone)) {
            const mid = custPhone.length === 11 ? 7 : 6;
            variants.add(`${custPhone.slice(0, 3)}-${custPhone.slice(3, mid)}-${custPhone.slice(mid)}`);
            variants.add(`+82 ${custPhone.slice(1, 3)}-${custPhone.slice(3, mid)}-${custPhone.slice(mid)}`);
            variants.add(`+82${custPhone.slice(1)}`);
          }
          const { data: cust } = await supabaseAdmin
            .from("customers")
            .select("id, phone")
            .in("phone", Array.from(variants))
            .limit(1)
            .maybeSingle();
          customerId = cust?.id ?? null;
          if (!customerId) {
            // Fallback: fuzzy match by digits-only via ilike patterns
            const last8 = custPhone.slice(-8);
            const { data: fuzzy } = await supabaseAdmin
              .from("customers")
              .select("id, phone")
              .ilike("phone", `%${last8.slice(0, 4)}%${last8.slice(4)}%`)
              .limit(1)
              .maybeSingle();
            customerId = fuzzy?.id ?? null;
          }
        }


        const { error } = await supabaseAdmin.from("phone_call_logs" as any).insert({
          staff_id: staffId,
          employee_phone: empPhone ?? data.employee_phone,
          customer_phone: custPhone,
          customer_id: customerId,
          direction: data.direction,
          status: data.status ?? null,
          duration_sec: duration,
          started_at: startedIso,
          raw: body as any,
        });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: jsonHeaders,
          });
        }

        return new Response(
          JSON.stringify({ ok: true, matched_staff: !!staffId, matched_customer: !!customerId }),
          { status: 201, headers: jsonHeaders }
        );
      },
    },
  },
});
