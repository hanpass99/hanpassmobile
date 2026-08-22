ALTER TABLE public.telegram_chats
  ADD COLUMN IF NOT EXISTS reply_lock_by uuid,
  ADD COLUMN IF NOT EXISTS reply_lock_at timestamptz;

CREATE OR REPLACE FUNCTION public.acquire_telegram_reply_lock(_chat_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _row public.telegram_chats%ROWTYPE;
  _holder uuid;
  _left int;
BEGIN
  IF _me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  UPDATE public.telegram_chats
     SET reply_lock_by = _me, reply_lock_at = now()
   WHERE id = _chat_row_id
     AND (
       reply_lock_by IS NULL
       OR reply_lock_by = _me
       OR reply_lock_at IS NULL
       OR reply_lock_at < now() - interval '60 seconds'
       OR public.has_role(_me, 'admin')
     )
  RETURNING * INTO _row;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT reply_lock_by,
         GREATEST(0, 60 - EXTRACT(EPOCH FROM (now() - reply_lock_at))::int)
    INTO _holder, _left
    FROM public.telegram_chats
   WHERE id = _chat_row_id;

  RETURN jsonb_build_object(
    'ok', false,
    'reason', 'locked',
    'locked_by', _holder,
    'seconds_left', COALESCE(_left, 0),
    'locked_by_name', (SELECT display_name FROM public.profiles WHERE id = _holder)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_telegram_reply_lock(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.acquire_telegram_reply_lock(uuid) TO authenticated, service_role;