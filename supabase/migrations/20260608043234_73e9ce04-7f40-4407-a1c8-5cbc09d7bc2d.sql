
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill existing rows with updated_at as a best-effort
UPDATE public.customers
SET status_changed_at = COALESCE(status_changed_at, updated_at)
WHERE status_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_status_changed_at
  ON public.customers (status_changed_at DESC);

-- Update auto_assign_customer to also record status change metadata
CREATE OR REPLACE FUNCTION public.auto_assign_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Stamp status change on insert
    NEW.status_changed_at := now();
    NEW.status_changed_by := uid;

    IF uid IS NOT NULL
       AND NEW.assigned_to IS NULL
       AND NOT public.has_role(uid, 'admin'::public.app_role) THEN
      NEW.assigned_to := uid;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_changed_at := now();
      NEW.status_changed_by := uid;

      -- When a staff member changes the status, they take over as the assignee.
      IF uid IS NOT NULL
         AND NOT public.has_role(uid, 'admin'::public.app_role) THEN
        NEW.assigned_to := uid;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
