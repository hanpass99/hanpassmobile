
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS activation_date date,
  ADD COLUMN IF NOT EXISTS carrier_plan text,
  ADD COLUMN IF NOT EXISTS charge_phone text,
  ADD COLUMN IF NOT EXISTS charge_amount numeric,
  ADD COLUMN IF NOT EXISTS charge_date date,
  ADD COLUMN IF NOT EXISTS application_date date,
  ADD COLUMN IF NOT EXISTS requested_plan text;
