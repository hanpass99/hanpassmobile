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
  direction: z.enum(["incoming", "outgoing", "missed"]),
  status: z.string().max(32).optional().nullable(),
  duration: z.union([z.number(), z.string()]).optional(),
  started_at: z.string().optional().nullable(),
});

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  // Korean mobile: strip country code 82
  if (digits.startsWith("82") && digits.length >= 11) return "0" + digits.slice(2);
  return digits;
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

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "invalid_payload", details: parsed.error.flatten() }),
            { status: 400, headers: jsonHeaders }
          );
        }
        const data = parsed.data;
        const empPhone = normalizePhone(data.employee_phone);
        const custPhone = normalizePhone(data.customer_phone ?? null);
        const durationRaw = Number(data.duration ?? 0);
        const duration = Number.isFinite(durationRaw) ? Math.round(durationRaw) : 0;
        const startedAt = data.started_at ? new Date(data.started_at) : new Date();
        const startedIso = isNaN(startedAt.getTime()) ? new Date().toISOString() : startedAt.toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let staffId: string | null = null;
        if (empPhone) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("phone" as any, empPhone)
            .maybeSingle();
          staffId = prof?.id ?? null;
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
