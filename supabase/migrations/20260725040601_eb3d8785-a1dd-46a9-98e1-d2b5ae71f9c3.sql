INSERT INTO public.customers (name, phone, country_id, signup_date, status, pool, notes, assigned_to)
SELECT fr.name, fr.phone,
  (SELECT id FROM public.countries WHERE code = fr.country_code LIMIT 1),
  fr.signup_date, 'new'::public.customer_status, 'friend_referral'::public.customer_pool,
  CASE WHEN fr.country_code = 'CIS' THEN '친구 추천 자동 등록' ELSE '친구 추천 자동 등록' END,
  NULL
FROM public.friend_referrals fr
WHERE NOT EXISTS (
  SELECT 1 FROM public.customers c
  WHERE c.pool = 'friend_referral'::public.customer_pool
    AND c.name = fr.name AND c.phone = fr.phone
)
AND fr.country_code IN ('CIS','MM','LK','VN','BD','NP','PH','KH');