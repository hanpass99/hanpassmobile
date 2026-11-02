import { createFileRoute } from "@tanstack/react-router";

const REPORT_RECIPIENT_EMAIL = "asirojiddin123@hanpass.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/public/hooks/slack-daily-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
        if (!token) {
          return json({ error: "Unauthorized" }, 401);
        }

        try {
          const { sendDailyReportOnce } = await import("@/lib/slack-daily-report.server");
          const result = await sendDailyReportOnce(REPORT_RECIPIENT_EMAIL);
          return json({ success: true, ...result });
        } catch (error) {
          console.error("slack-daily-report failed:", error);
          return json(
            { success: false, error: error instanceof Error ? error.message : "unknown error" },
            500,
          );
        }
      },
    },
  },
});
