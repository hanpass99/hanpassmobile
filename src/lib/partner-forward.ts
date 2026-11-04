/**
 * Temporary migration forwarder for the legacy Lovable deployment.
 *
 * During the AWS cutover the partner site still posts applications to this
 * (legacy) deployment. When PARTNER_FORWARD_URL is configured, every partner
 * request is handed to the target deployment untouched and its response is
 * returned verbatim, so new applications land in exactly one database.
 *
 * Set PARTNER_FORWARD_URL ONLY on the legacy deployment. The AWS deployment
 * must never have it — it would forward to itself in a loop.
 */
export async function forwardPartnerRequest(
  request: Request,
  pathSuffix: string
): Promise<Response | null> {
  const target = (process.env.PARTNER_FORWARD_URL ?? "").trim();
  if (!target) return null;

  const headers = new Headers();
  for (const name of ["content-type", "x-api-key", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const url = target.replace(/\/+$/, "") + pathSuffix;
  try {
    return await fetch(url, init);
  } catch {
    console.error(`[partner-forward] forward failed method=${request.method}`);
    return new Response(JSON.stringify({ error: "forward_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
