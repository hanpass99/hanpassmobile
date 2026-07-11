
-- 1. Clean existing duplicates (keep earliest)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY name, phone ORDER BY imported_at ASC, id ASC) AS rn
  FROM public.customers
  WHERE pool = 'google_form_activation'
)
DELETE FROM public.customers WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Add partial unique index to prevent future duplicates at DB level
CREATE UNIQUE INDEX IF NOT EXISTS customers_google_form_dedup_idx
  ON public.customers (name, phone)
  WHERE pool = 'google_form_activation';
