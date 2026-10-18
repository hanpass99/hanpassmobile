import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Bearer authentication alone is insufficient: privileged handlers can bypass RLS.
const approvedStaffFunctions = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const header = getRequest().headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("auth_configuration_missing");
    const client = createClient(url, key, {
      global: { headers: { Authorization: header } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claims, error: authError } = await client.auth.getClaims(header.slice(7));
    if (authError || !claims?.claims.sub) throw new Error("unauthorized");
    const { data: approved, error } = await client.rpc("is_approved_staff", { uid: claims.claims.sub });
    if (error || !approved) throw new Error("staff_approval_required");
  }
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, approvedStaffFunctions],
  requestMiddleware: [errorMiddleware],
}));
