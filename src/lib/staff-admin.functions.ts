import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isApprovedStaff, staffBanDuration } from "./staff-security";
import { classifyStaffCreationError } from "./staff-creation-errors";

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        active: z.boolean(),
        approve: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !admin || data.user_id === context.userId) throw new Error("forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Disable database access first: an already-issued JWT must stop working immediately.
    if (!data.active) {
      const { error } = await supabaseAdmin.rpc("admin_set_profile_active", {
        _user_id: data.user_id,
        _active: false,
      });
      if (error) throw new Error("staff_update_failed");
    }
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: staffBanDuration(data.active),
    });
    if (authError) throw new Error("staff_auth_update_failed");
    if (data.active) {
      // Role remains non-authorizing until activation; country grant is transactional in the DB trigger.
      if (data.approve) {
        const { error } = await context.supabase.rpc("admin_set_user_role", {
          _user_id: data.user_id,
          _role: "staff",
        });
        if (error) throw new Error("staff_role_update_failed");
      }
      const { error } = await supabaseAdmin.rpc("admin_set_profile_active", {
        _user_id: data.user_id,
        _active: true,
      });
      if (error) throw new Error("staff_update_failed");
    }
    return { ok: true };
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6).max(100),
        display_name: z.string().trim().min(1),
        department: z.string().optional(),
        company: z.enum(["한패스", "한패스 모바일"]),
        country_ids: z.array(z.string().uuid()),
        role: z.enum(["admin", "staff", "hanpass_staff"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !admin) throw new Error("forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      app_metadata: { created_by_admin: true },
      user_metadata: {
        display_name: data.display_name,
        department: data.department ?? null,
        company: data.company,
      },
    });
    if (createError || !created.user)
      return { ok: false, error: classifyStaffCreationError(createError) };
    const uid = created.user.id;
    try {
      const { error: countryError } = await context.supabase.rpc("admin_set_profile_countries", {
        _user_id: uid,
        _country_ids: data.country_ids,
      });
      if (countryError) throw new Error("staff_provision_failed");
      const { error: roleError } = await context.supabase.rpc("admin_set_user_role", {
        _user_id: uid,
        _role: data.role,
      });
      if (roleError) throw new Error("staff_provision_failed");
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("approval_status,is_active")
        .eq("id", uid)
        .single();
      if (profileError || !isApprovedStaff(profile)) throw new Error("staff_provision_failed");
      return { ok: true, user_id: uid };
    } catch {
      // Compensate only for the account created by this request, never an existing email.
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (!deleteError) return { ok: false, error: "staff_provision_failed" as const };
      await supabaseAdmin.auth.admin.updateUserById(uid, { ban_duration: staffBanDuration(false) });
      await supabaseAdmin.rpc("admin_set_profile_active", { _user_id: uid, _active: false });
      return { ok: false, error: "staff_cleanup_failed" as const };
    }
  });
