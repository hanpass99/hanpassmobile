-- Administrators cannot bypass Auth ban/unban by directly updating profile status.
CREATE FUNCTION public.require_auth_managed_staff_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.approval_status IS DISTINCT FROM OLD.approval_status)
 AND auth.uid() IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'staff_auth_transition_required';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER require_auth_managed_staff_transition BEFORE UPDATE OF is_active,approval_status ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.require_auth_managed_staff_transition();