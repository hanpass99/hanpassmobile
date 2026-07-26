
CREATE OR REPLACE FUNCTION public.telegram_messages_protect_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sent_by IS DISTINCT FROM OLD.sent_by
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'audit fields (sent_by, direction, created_at) on telegram_messages are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_messages_protect_audit_trg ON public.telegram_messages;
CREATE TRIGGER telegram_messages_protect_audit_trg
BEFORE UPDATE ON public.telegram_messages
FOR EACH ROW EXECUTE FUNCTION public.telegram_messages_protect_audit();
