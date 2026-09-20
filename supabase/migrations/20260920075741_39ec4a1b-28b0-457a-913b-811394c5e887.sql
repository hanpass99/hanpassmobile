CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'hourly_system_checks';
SELECT cron.schedule('hourly_system_checks', '7 * * * *', $$SELECT public.run_system_checks();$$);