DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(id) INTO ids FROM public.customers WHERE pool='one_year_activation' AND store_name='MSK';
  IF ids IS NULL THEN RETURN; END IF;
  DELETE FROM public.customer_notes WHERE customer_id = ANY(ids);
  DELETE FROM public.call_logs WHERE customer_id = ANY(ids);
  DELETE FROM public.customer_call_rounds WHERE customer_id = ANY(ids);
  DELETE FROM public.customer_status_history WHERE customer_id = ANY(ids);
  UPDATE public.pending_calls SET customer_id = NULL WHERE customer_id = ANY(ids);
  UPDATE public.phone_call_logs SET customer_id = NULL WHERE customer_id = ANY(ids);
  UPDATE public.telegram_chats SET customer_id = NULL WHERE customer_id = ANY(ids);
  UPDATE public.google_form_submissions SET customer_id = NULL WHERE customer_id = ANY(ids);
  UPDATE public.sms_logs SET customer_id = NULL WHERE customer_id = ANY(ids);
  DELETE FROM public.customers WHERE id = ANY(ids);
END $$;