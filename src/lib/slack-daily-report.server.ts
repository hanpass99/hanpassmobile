/**
 * Slack daily applicant report (server-only).
 *
 * Computes previous-day (KST) applicant stats from the customers table and
 * sends a DM through the existing Hanpass Mobile Bot (SLACK_BOT_TOKEN).
 * Idempotent per report date via the slack_daily_report_log table.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface DailyReportStats {
  reportDate: string; // KST date the report covers (yyyy-MM-dd)
  applicants: number; // applications created on reportDate
  activations: number; // status changed to activated on reportDate
  unprocessed: number; // current customers with status 'new'
  monthToDate: number; // applications from the 1st of reportDate's month
}

/** KST calendar boundaries for "yesterday" expressed as UTC ISO strings. */
export function kstYesterdayRange(now: Date = new Date()): {
  reportDate: string;
  dayStartUtc: string;
  dayEndUtc: string;
  monthStartUtc: string;
} {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  // Yesterday 00:00 KST = today 00:00 KST minus one day, expressed in UTC ms.
  const todayStartKstMs = Date.UTC(y, m, d) - KST_OFFSET_MS;
  const dayStartMs = todayStartKstMs - 24 * 60 * 60 * 1000;
  const dayStart = new Date(dayStartMs + KST_OFFSET_MS);
  const reportDate = [
    dayStart.getUTCFullYear(),
    String(dayStart.getUTCMonth() + 1).padStart(2, "0"),
    String(dayStart.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const monthStartMs = Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1) - KST_OFFSET_MS;
  return {
    reportDate,
    dayStartUtc: new Date(dayStartMs).toISOString(),
    dayEndUtc: new Date(todayStartKstMs).toISOString(),
    monthStartUtc: new Date(monthStartMs).toISOString(),
  };
}

export function formatReportMessage(stats: DailyReportStats): string {
  const [year, month, day] = stats.reportDate.split("-").map(Number);
  return [
    `📊 한패스앱 신청 현황 (${year}년 ${month}월 ${day}일 기준)`,
    `• 유심 신청: ${stats.applicants}건`,
    `• 개통완료: ${stats.activations}건`,
    `• 미처리: ${stats.unprocessed}건`,
    `• ${month}월 누적: ${stats.monthToDate}건`,
  ].join("\n");
}

/** The report covers Hanpass app activation applicants only (개통 신청자). */
const REPORT_POOL = "activation_request";

async function countCustomers(
  supabaseAdmin: any,
  build: (q: any) => any,
): Promise<number> {
  const query = build(
    supabaseAdmin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("pool", REPORT_POOL),
  );
  const { count, error } = await query;
  if (error) throw new Error(`customers count failed: ${error.message}`);
  return count ?? 0;
}

export async function collectDailyStats(now: Date = new Date()): Promise<DailyReportStats> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const range = kstYesterdayRange(now);

  const [applicants, activations, unprocessed, monthToDate] = await Promise.all([
    countCustomers(supabaseAdmin, (q) =>
      q.gte("created_at", range.dayStartUtc).lt("created_at", range.dayEndUtc),
    ),
    countCustomers(supabaseAdmin, (q) =>
      q
        .eq("status", "activated")
        .gte("status_changed_at", range.dayStartUtc)
        .lt("status_changed_at", range.dayEndUtc),
    ),
    countCustomers(supabaseAdmin, (q) => q.eq("status", "new")),
    countCustomers(supabaseAdmin, (q) =>
      q.gte("created_at", range.monthStartUtc).lt("created_at", range.dayEndUtc),
    ),
  ]);

  return { reportDate: range.reportDate, applicants, activations, unprocessed, monthToDate };
}

async function slackApi(method: string, body: Record<string, unknown>): Promise<any> {
  const token = process.env["SLACK_BOT_TOKEN"];
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured");
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Slack ${method} failed (HTTP ${res.status}): ${data.error ?? res.statusText}`);
  }
  return data;
}

/** Send the report DM to one recipient identified by email. */
export async function sendReportToEmail(email: string, text: string): Promise<{ userId: string }> {
  // users.lookupByEmail only accepts form/query parameters, not a JSON body.
  const token = process.env["SLACK_BOT_TOKEN"];
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured");
  const lookupRes = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  const lookup = await lookupRes.json().catch(() => ({}));
  if (!lookupRes.ok || !lookup.ok) {
    throw new Error(
      `Slack users.lookupByEmail failed (HTTP ${lookupRes.status}): ${lookup.error ?? lookupRes.statusText}`,
    );
  }
  const userId: string | undefined = lookup.user?.id;
  if (!userId) throw new Error(`Slack user not found for ${email}`);
  const opened = await slackApi("conversations.open", { users: userId });
  const channelId: string | undefined = opened.channel?.id;
  if (!channelId) throw new Error("Slack DM channel could not be opened");
  await slackApi("chat.postMessage", { channel: channelId, text });
  return { userId };
}

/**
 * Send the daily report once per report date. Returns true when a message was
 * sent, false when this date was already delivered.
 */
export async function sendDailyReportOnce(recipientEmail: string, now: Date = new Date()): Promise<{
  sent: boolean;
  stats: DailyReportStats;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stats = await collectDailyStats(now);

  const { data: existing, error: readError } = await supabaseAdmin
    .from("slack_daily_report_log")
    .select("sent_on")
    .eq("sent_on", stats.reportDate)
    .maybeSingle();
  if (readError) throw new Error(`report log read failed: ${readError.message}`);
  if (existing) return { sent: false, stats };

  await sendReportToEmail(recipientEmail, formatReportMessage(stats));

  const { error: insertError } = await supabaseAdmin
    .from("slack_daily_report_log")
    .insert({ sent_on: stats.reportDate });
  if (insertError) {
    // Another run may have recorded the same date concurrently; treat as sent.
    if (insertError.code !== "23505") {
      throw new Error(`report log insert failed: ${insertError.message}`);
    }
  }
  return { sent: true, stats };
}
