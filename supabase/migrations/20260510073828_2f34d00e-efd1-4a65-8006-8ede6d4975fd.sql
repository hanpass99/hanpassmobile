-- 1) Auto-assign current user as assigned_to whenever a customer's status changes
CREATE OR REPLACE FUNCTION public.auto_assign_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL THEN
    NEW.assigned_to := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_status ON public.customers;
CREATE TRIGGER trg_auto_assign_status
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_on_status_change();

-- 2) Allow staff to update customer rows (currently only assigned/admin can update).
-- This permits a staff member to claim/take over a customer by changing status.
DROP POLICY IF EXISTS customers_update_staff ON public.customers;
CREATE POLICY customers_update_staff ON public.customers
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL);

-- 3) Enable realtime on call_logs so the daily-call-goal hook can react in real time
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;