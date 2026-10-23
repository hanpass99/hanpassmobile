ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS delivery_cursor uuid, ADD COLUMN IF NOT EXISTS delivery_version integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS delivery_lock uuid, ADD COLUMN IF NOT EXISTS delivery_lock_at timestamptz;
CREATE OR REPLACE FUNCTION public.claim_broadcast_delivery(broadcast_id uuid, lock_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.broadcasts;
BEGIN
 IF NOT public.is_approved_staff(auth.uid()) OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO b FROM public.broadcasts WHERE id = broadcast_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'broadcast_not_found'; END IF;
 IF b.status = 'completed' THEN RETURN to_jsonb(b); END IF;
 IF b.delivery_version <> 1 THEN RAISE EXCEPTION 'broadcast_legacy_resume_unsafe'; END IF;
 IF b.delivery_lock IS NOT NULL THEN RAISE EXCEPTION 'broadcast_delivery_in_progress_or_uncertain'; END IF;
 UPDATE public.broadcasts SET delivery_lock = lock_id, delivery_lock_at = now() WHERE id = broadcast_id RETURNING * INTO b;
 RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.claim_broadcast_delivery(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_delivery(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.checkpoint_broadcast_delivery(broadcast_id uuid, lock_id uuid, cursor_id uuid, sent integer, failed integer, completed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.is_approved_staff(auth.uid()) OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF sent NOT IN (0,1) OR failed NOT IN (0,1) OR sent + failed > 1 THEN RAISE EXCEPTION 'invalid_delivery_count'; END IF;
 UPDATE public.broadcasts SET delivery_cursor = cursor_id, success_count = success_count + sent, failed_count = failed_count + failed, status = CASE WHEN completed THEN 'completed' ELSE 'sending' END, delivery_lock = NULL, delivery_lock_at = NULL WHERE id = broadcast_id AND delivery_lock = lock_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'broadcast_checkpoint_conflict'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.checkpoint_broadcast_delivery(uuid,uuid,uuid,integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkpoint_broadcast_delivery(uuid,uuid,uuid,integer,integer,boolean) TO authenticated;