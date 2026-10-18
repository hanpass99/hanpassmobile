import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const Route = createFileRoute("/api/public/change-password")({
  server: { handlers: { POST: async ({ request }) => {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return Response.json({ error: "auth_configuration_missing" }, { status: 500 });
    const client = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: authError } = await client.auth.getUser(token);
    const user = userData.user;
    if (authError || !user) return Response.json({ error: "unauthorized" }, { status: 401 });
    const input = z.object({ password: z.string().min(6).max(100) }).safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "invalid_password" }, { status: 400 });
    // Password replacement alone is allowed before business approval; no business data is returned.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: input.data.password,
      app_metadata: { ...user.app_metadata, must_change_password: false },
      user_metadata: { ...user.user_metadata, must_change_password: false },
    });
    if (error) return Response.json({ error: "password_update_failed" }, { status: 400 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } } },
});