
-- 허용 국가 외 친구 추천 데이터 삭제
DELETE FROM public.customers
WHERE pool = 'friend_referral'
  AND (country_id IS NULL
       OR country_id NOT IN (SELECT id FROM public.countries WHERE code IN ('CIS','MM','LK','VN','BD','NP','PH','KH')));

DELETE FROM public.friend_referrals
WHERE country_code IS NULL
   OR country_code NOT IN ('CIS','MM','LK','VN','BD','NP','PH','KH');
