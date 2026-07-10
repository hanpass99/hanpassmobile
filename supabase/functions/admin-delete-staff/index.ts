// Admin-only edge function to delete a staff user.
// Customers/notes are preserved; assigned customers are unassigned.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "unauthorized" }, 401);
    }
    const { data: roleData } = await userClient
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleData) return json({ error: "forbidden" }, 403);

    const { user_id } = (await req.json()) as { user_id: string };
    if (!user_id) return json({ error: "user_id required" }, 400);
    if (user_id === userData.user.id) return json({ error: "cannot_delete_self" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Soft-delete: preserve customers.assigned_to and profile row so historical
    // performance (past activations, call logs, notes) stays attributed to this
    // staff. Revoke access by removing role and banning the auth user.
    await admin.from("user_roles").delete().eq("user_id", user_id);
    await admin.from("profile_countries").delete().eq("user_id", user_id);
    await admin.from("targets").delete().eq("user_id", user_id);
    await admin.from("profiles").update({ is_active: false }).eq("id", user_id);
    // Delete the auth user to revoke sign-in. FK from profiles.id to auth.users
    // was dropped, so the profile row (with is_active=false) remains for history.
    const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
    if (delErr) return json({ error: delErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
