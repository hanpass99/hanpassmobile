
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) rn
  FROM customers
  WHERE pool='google_form_activation' AND phone IS NOT NULL
), dups AS (SELECT id FROM ranked WHERE rn>1)
DELETE FROM google_form_submissions WHERE customer_id IN (SELECT id FROM dups);

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) rn
  FROM customers
  WHERE pool='google_form_activation' AND phone IS NOT NULL
)
DELETE FROM customers WHERE id IN (SELECT id FROM ranked WHERE rn>1);

DELETE FROM google_form_submissions
WHERE customer_id IN (
  SELECT gfa.id FROM customers gfa
  WHERE gfa.pool='google_form_activation'
    AND EXISTS (SELECT 1 FROM customers ar WHERE ar.pool='activation_request' AND ar.phone=gfa.phone)
);
DELETE FROM customers gfa
WHERE gfa.pool='google_form_activation'
  AND EXISTS (SELECT 1 FROM customers ar WHERE ar.pool='activation_request' AND ar.phone=gfa.phone);

DROP INDEX IF EXISTS public.customers_google_form_dedup_idx;
DROP INDEX IF EXISTS public.customers_google_form_phone_uidx;
CREATE UNIQUE INDEX customers_google_form_phone_uidx
  ON public.customers(phone)
  WHERE pool = 'google_form_activation'::customer_pool AND phone IS NOT NULL;
