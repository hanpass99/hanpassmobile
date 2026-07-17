
BEGIN;
LOCK TABLE public.friend_referrals IN EXCLUSIVE MODE;
LOCK TABLE public.customers IN EXCLUSIVE MODE;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY member_no ORDER BY created_at ASC, id ASC) AS rn
  FROM public.friend_referrals
)
DELETE FROM public.friend_referrals fr USING ranked r
WHERE fr.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY name, phone ORDER BY imported_at ASC, id ASC) AS rn
  FROM public.customers
  WHERE pool = 'friend_referral'::public.customer_pool
)
DELETE FROM public.customers c USING ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX friend_referrals_member_no_uniq
  ON public.friend_referrals(member_no);

CREATE UNIQUE INDEX customers_friend_referral_dedup_idx
  ON public.customers(name, phone)
  WHERE pool = 'friend_referral'::public.customer_pool;
COMMIT;
