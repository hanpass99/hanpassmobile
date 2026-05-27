-- Attach auto_assign_customer as BEFORE INSERT trigger so staff inserts
-- without an explicit assigned_to default to auth.uid() and pass RLS WITH CHECK.
DROP TRIGGER IF EXISTS trg_auto_assign_customer ON public.customers;
CREATE TRIGGER trg_auto_assign_customer
BEFORE INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_customer();

-- Also attach the UPDATE auto-assign / unassign triggers if missing,
-- since the db reports no triggers attached.
DROP TRIGGER IF EXISTS trg_auto_assign_on_status_change ON public.customers;
CREATE TRIGGER trg_auto_assign_on_status_change
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_on_status_change();

DROP TRIGGER IF EXISTS trg_unassign_on_new_status ON public.customers;
CREATE TRIGGER trg_unassign_on_new_status
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.unassign_on_new_status();

DROP TRIGGER IF EXISTS trg_prevent_assigned_to_escalation ON public.customers;
CREATE TRIGGER trg_prevent_assigned_to_escalation
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_assigned_to_escalation();

DROP TRIGGER IF EXISTS trg_set_channel_from_pool ON public.customers;
CREATE TRIGGER trg_set_channel_from_pool
BEFORE INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.set_channel_from_pool();

DROP TRIGGER IF EXISTS trg_record_call_round ON public.customers;
CREATE TRIGGER trg_record_call_round
AFTER INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.record_call_round();

DROP TRIGGER IF EXISTS trg_touch_updated_at_customers ON public.customers;
CREATE TRIGGER trg_touch_updated_at_customers
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();