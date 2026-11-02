CREATE TABLE public.slack_daily_report_log (
  sent_on date PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.slack_daily_report_log TO service_role;

ALTER TABLE public.slack_daily_report_log ENABLE ROW LEVEL SECURITY;