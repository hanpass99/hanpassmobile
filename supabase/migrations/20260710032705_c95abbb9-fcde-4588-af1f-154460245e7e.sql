
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_assigned_to_fkey;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_status_changed_by_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

INSERT INTO public.profiles (id, display_name, is_active)
SELECT DISTINCT r.staff_id,
       '퇴사자(' || substr(r.staff_id::text, 1, 8) || ')',
       false
FROM public.customer_call_rounds r
LEFT JOIN public.profiles p ON p.id = r.staff_id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.customers DISABLE TRIGGER USER;
WITH latest AS (
  SELECT DISTINCT ON (r.customer_id)
    r.customer_id, r.staff_id
  FROM public.customer_call_rounds r
  ORDER BY r.customer_id, r.call_date DESC, r.updated_at DESC
)
UPDATE public.customers c
SET assigned_to = l.staff_id
FROM latest l
WHERE c.id = l.customer_id
  AND c.assigned_to IS NULL;
ALTER TABLE public.customers ENABLE TRIGGER USER;
