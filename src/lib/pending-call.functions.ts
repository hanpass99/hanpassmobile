import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("82") && digits.length >= 11) return "0" + digits.slice(2);
  return digits;
}

/**
 * Enqueue a call request. The signed-in employee's Android work phone (Automate
 * app) polls /api/public/pending-call and dials the target number automatically.
 */
export const requestCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        target_phone: z.string().min(4).max(32),
        customer_id: z.string().uuid().optional().nullable(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const target = normalizePhone(data.target_phone);
    if (!target) throw new Error("invalid_target_phone");

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);

    const empPhone = normalizePhone((prof as any)?.phone ?? null);
    if (!empPhone) {
      throw new Error("no_employee_phone");
    }

    const { error } = await supabase.from("pending_calls" as any).insert({
      employee_phone: empPhone,
      target_phone: target,
      requested_by: userId,
      customer_id: data.customer_id ?? null,
    });
    if (error) throw new Error(error.message);

    return { ok: true, employee_phone: empPhone, target_phone: target };
  });
