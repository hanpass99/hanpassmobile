-- 구글 시트 동기화 상태를 정확히 기록 (2026-10-29)
-- 예전 점검은 "새 신청이 마지막으로 저장된 시각"을 봐서, 새 신청이 없으면 정상인데도 오류로 표시됐음.
-- 이제 시트별로 "마지막으로 동기화가 끝까지 성공한 시각"을 기록하고, 가장 오래된 시트 기준으로 판정.

ALTER TABLE public.sync_job_runs
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fetched integer,
  ADD COLUMN IF NOT EXISTS last_inserted integer,
  ADD COLUMN IF NOT EXISTS last_errors integer;

CREATE OR REPLACE FUNCTION public.finish_sync_job(_job text, _fetched integer, _inserted integer, _errors integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sync_job_runs
     SET last_success_at = now(), last_fetched = _fetched, last_inserted = _inserted, last_errors = _errors
   WHERE job = _job;
$$;
REVOKE ALL ON FUNCTION public.finish_sync_job(text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_sync_job(text, integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_sync_job(text, integer, integer, integer) TO service_role;

-- run_system_checks 의 google_sheet_sync 블록만 교체 (나머지 점검은 그대로)
DO $do$
DECLARE
  def text := pg_get_functiondef('public.run_system_checks'::regproc);
  old_block text := $old$  SELECT MAX(synced_at) INTO _ts FROM public.google_form_submissions;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('google_sheet_sync', 'integration',
    CASE WHEN _ts IS NULL THEN 'error'
         WHEN _ts > now() - interval '24 hours' THEN 'ok'
         WHEN _ts > now() - interval '72 hours' THEN 'warn' ELSE 'error' END,
    CASE WHEN _ts IS NULL THEN '구글 시트 동기화 기록이 없습니다'
         ELSE format('구글 시트 마지막 동기화: %s', to_char(_ts AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI')) END,
    round(EXTRACT(EPOCH FROM (now() - COALESCE(_ts, now()))) / 3600, 1),
    jsonb_build_object('last_at', _ts));$old$;
  new_block text := $new$  -- 시트별 마지막 "성공" 시각 중 가장 오래된 것으로 판정 (기록이 아직 없으면 예전 방식)
  SELECT MIN(last_success_at) INTO _ts FROM public.sync_job_runs WHERE job LIKE 'sheet:%';
  IF _ts IS NULL THEN
    SELECT MAX(synced_at) INTO _ts FROM public.google_form_submissions;
  END IF;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('google_sheet_sync', 'integration',
    CASE WHEN _ts IS NULL THEN 'warn'
         WHEN _ts > now() - interval '24 hours' THEN 'ok'
         WHEN _ts > now() - interval '72 hours' THEN 'warn' ELSE 'error' END,
    CASE WHEN _ts IS NULL THEN '구글 시트 동기화 성공 기록이 아직 없습니다'
         ELSE format('구글 시트 동기화 마지막 성공 (가장 오래된 시트 기준): %s', to_char(_ts AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI')) END,
    round(EXTRACT(EPOCH FROM (now() - COALESCE(_ts, now()))) / 3600, 1),
    jsonb_build_object('last_at', _ts, 'sheets',
      (SELECT jsonb_object_agg(job, jsonb_build_object(
          'last_success_at', last_success_at, 'last_fetched', last_fetched,
          'last_inserted', last_inserted, 'last_errors', last_errors))
         FROM public.sync_job_runs WHERE job LIKE 'sheet:%')));$new$;
BEGIN
  IF position(new_block IN def) > 0 THEN
    RETURN; -- 이미 적용됨
  END IF;
  IF (length(def) - length(replace(def, old_block, ''))) / length(old_block) <> 1 THEN
    RAISE EXCEPTION 'run_system_checks: google_sheet_sync block not found exactly once — not changed';
  END IF;
  EXECUTE replace(def, old_block, new_block);
END
$do$;
