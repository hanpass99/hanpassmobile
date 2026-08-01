import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function expectedSecret(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  return createHash("sha256").update(`ai-learn-cron:${token}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Cron-triggered incremental learning: reads the human operators' latest replies
// and turns them into FAQ knowledge so the AI keeps learning from staff in near real time.
async function handle(request: Request) {
  const provided = request.headers.get("x-ai-learn-secret") ?? "";
  if (!provided || !safeEqual(provided, expectedSecret())) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runAutoLearn } = await import("@/lib/ai-learn.server");
    const result = await runAutoLearn(supabaseAdmin, { triggerSource: "cron" });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ai-learn cron] failed", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/ai-learn/run")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
