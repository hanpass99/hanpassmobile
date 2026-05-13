// Aligo SMS/LMS sender
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  receivers: { customer_id?: string | null; name?: string | null; phone: string }[];
  message: string;
  title?: string;
  testmode?: boolean;
}

const ALIGO_URL = "https://apis.aligo.in/send/";
const PROXY_URL = Deno.env.get("PROXY_URL");
const PROXY_SECRET = Deno.env.get("PROXY_SECRET");

function normalizePhone(p: string): string {
  return (p || "").replace(/[^0-9]/g, "");
}

function byteLength(s: string): number {
  // Aligo: SMS ≤ 90 bytes (EUC-KR ish: korean=2, ascii=1)
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 127 ? 2 : 1;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as ReqBody;
    if (!body?.receivers?.length || !body.message?.trim()) {
      return json({ error: "수신자와 메시지는 필수입니다" }, 400);
    }
    if (body.receivers.length > 1000) {
      return json({ error: "한 번에 최대 1000명까지 발송 가능합니다" }, 400);
    }

    const ALIGO_API_KEY = Deno.env.get("ALIGO_API_KEY");
    const ALIGO_USER_ID = Deno.env.get("ALIGO_USER_ID");
    const ALIGO_SENDER = Deno.env.get("ALIGO_SENDER");
    if (!ALIGO_API_KEY || !ALIGO_USER_ID || !ALIGO_SENDER) {
      return json({ error: "알리고 환경 변수가 설정되지 않았습니다" }, 500);
    }

    const phones = body.receivers.map((r) => normalizePhone(r.phone)).filter((p) => p.length >= 9);
    if (phones.length === 0) return json({ error: "유효한 전화번호가 없습니다" }, 400);

    const isLms = byteLength(body.message) > 90;
    const msgType = isLms ? "LMS" : "SMS";

    const form = new FormData();
    form.append("key", ALIGO_API_KEY);
    form.append("user_id", ALIGO_USER_ID);
    form.append("sender", ALIGO_SENDER);
    form.append("receiver", phones.join(","));
    form.append("msg", body.message);
    form.append("msg_type", msgType);
    if (isLms && body.title) form.append("title", body.title.slice(0, 44));
    form.append("testmode_yn", body.testmode ? "Y" : "N");

    const targetUrl = PROXY_URL ? `${PROXY_URL.replace(/\/$/, "")}/send` : ALIGO_URL;
    const headers: Record<string, string> = {};
    if (PROXY_URL && PROXY_SECRET) headers["x-proxy-secret"] = PROXY_SECRET;
    const res = await fetch(targetUrl, { method: "POST", body: form, headers });
    const aligoData = await res.json().catch(() => ({}));
    const success = aligoData?.result_code === "1" || aligoData?.result_code === 1;

    // Insert logs (one row per receiver) using service role to bypass RLS but staff_id = user.id
    const admin = createClient(supaUrl, serviceKey);
    const rows = body.receivers
      .filter((r) => normalizePhone(r.phone).length >= 9)
      .map((r) => ({
        staff_id: user.id,
        customer_id: r.customer_id || null,
        receiver_name: r.name || null,
        receiver_phone: normalizePhone(r.phone),
        message: body.message,
        msg_type: msgType,
        title: isLms ? body.title || null : null,
        status: success ? "sent" : "failed",
        aligo_msg_id: aligoData?.msg_id ? String(aligoData.msg_id) : null,
        aligo_response: aligoData,
        error_message: success ? null : aligoData?.message || `code ${aligoData?.result_code}`,
      }));
    if (rows.length) await admin.from("sms_logs").insert(rows);

    return json({
      ok: success,
      msg_type: msgType,
      count: phones.length,
      aligo: aligoData,
    }, success ? 200 : 502);
  } catch (e) {
    console.error("send-sms error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
