
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'targets_user_year_month_uniq') THEN
    ALTER TABLE public.targets ADD CONSTRAINT targets_user_year_month_uniq UNIQUE (user_id, year, month);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_assigned_to ON public.customers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_customer ON public.call_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_staff_date ON public.call_logs(staff_id, call_date DESC);
