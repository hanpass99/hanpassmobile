-- 구글 시트 동기화 실패 이유 기록 (2026-10-30, 운영 적용)
-- 시트 동기화가 중간에 실패하면 시트별로 마지막 실패 시각·이유를 남김. 성공하면 지움.
-- (모든 시트를 한 요청에서 돌리던 방식에서 QR·친구추천 시트가 소리 없이 끊긴 일을 확인하기 위함)

ALTER TABLE public.sync_job_runs
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE OR REPLACE FUNCTION public.fail_sync_job(_job text, _message text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sync_job_runs SET last_error = left(_message, 500), last_error_at = now() WHERE job = _job;
$$;
REVOKE ALL ON FUNCTION public.fail_sync_job(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_sync_job(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_sync_job(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_sync_job(_job text, _fetched integer, _inserted integer, _errors integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sync_job_runs
     SET last_success_at = now(), last_fetched = _fetched, last_inserted = _inserted, last_errors = _errors,
         last_error = NULL, last_error_at = NULL
   WHERE job = _job;
$$;
REVOKE ALL ON FUNCTION public.finish_sync_job(text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_sync_job(text, integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_sync_job(text, integer, integer, integer) TO service_role;
