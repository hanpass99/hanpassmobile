DROP INDEX IF EXISTS public.customers_google_form_dedup_idx;
CREATE UNIQUE INDEX customers_google_form_dedup_idx
  ON public.customers (name, phone, signup_date)
  WHERE (pool = 'google_form_activation'::customer_pool);