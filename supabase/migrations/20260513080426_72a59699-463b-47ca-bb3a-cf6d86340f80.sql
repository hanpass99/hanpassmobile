
-- 국가별 통계: imported_at 기준 날짜 필터
create or replace function public.stats_by_country(_date_from timestamptz default null, _date_to timestamptz default null)
returns table(country_id uuid, code text, name_ko text, total bigint, status_counts jsonb)
language sql stable security invoker set search_path = public as $$
  with base as (
    select country_id, status::text as status
    from public.customers
    where country_id is not null
      and (_date_from is null or imported_at >= _date_from)
      and (_date_to is null or imported_at <= _date_to)
  ),
  per as (select country_id, status, count(*)::int as cnt from base group by 1,2),
  agg as (
    select country_id, sum(cnt)::bigint as total, jsonb_object_agg(status, cnt) as status_counts
    from per group by country_id
  )
  select co.id, co.code, co.name_ko, coalesce(a.total, 0), coalesce(a.status_counts, '{}'::jsonb)
  from public.countries co
  left join agg a on a.country_id = co.id
  where co.is_active = true;
$$;

-- 채널별 통계
create or replace function public.stats_by_channel(_date_from timestamptz default null, _date_to timestamptz default null)
returns table(channel_id uuid, name text, total bigint, status_counts jsonb)
language sql stable security invoker set search_path = public as $$
  with base as (
    select channel_id, status::text as status
    from public.customers
    where channel_id is not null
      and (_date_from is null or imported_at >= _date_from)
      and (_date_to is null or imported_at <= _date_to)
  ),
  per as (select channel_id, status, count(*)::int as cnt from base group by 1,2),
  agg as (
    select channel_id, sum(cnt)::bigint as total, jsonb_object_agg(status, cnt) as status_counts
    from per group by channel_id
  )
  select ch.id, ch.name, coalesce(a.total, 0), coalesce(a.status_counts, '{}'::jsonb)
  from public.channels ch
  left join agg a on a.channel_id = ch.id
  where ch.is_active = true;
$$;

-- 직원별 통계: updated_at 기준 (담당 변경/상태 변경 시점)
create or replace function public.stats_by_staff(_date_from timestamptz default null, _date_to timestamptz default null)
returns table(user_id uuid, display_name text, total bigint, status_counts jsonb)
language sql stable security invoker set search_path = public as $$
  with base as (
    select assigned_to, status::text as status
    from public.customers
    where assigned_to is not null
      and (_date_from is null or updated_at >= _date_from)
      and (_date_to is null or updated_at <= _date_to)
  ),
  per as (select assigned_to, status, count(*)::int as cnt from base group by 1,2),
  agg as (
    select assigned_to, sum(cnt)::bigint as total, jsonb_object_agg(status, cnt) as status_counts
    from per group by assigned_to
  )
  select p.id, p.display_name, coalesce(a.total, 0), coalesce(a.status_counts, '{}'::jsonb)
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id and ur.role = 'staff'::app_role
  left join agg a on a.assigned_to = p.id
  where p.is_active = true;
$$;

-- 대시보드 상태 카운트 (전체 고객, 국가 옵션)
create or replace function public.stats_status_counts(_country_id uuid default null)
returns table(status text, cnt bigint)
language sql stable security invoker set search_path = public as $$
  select status::text, count(*)::bigint
  from public.customers
  where (_country_id is null or country_id = _country_id)
  group by status;
$$;

-- 대시보드 일별 콜수/개통수
create or replace function public.stats_daily_calls(_date_from timestamptz, _date_to timestamptz, _country_id uuid default null)
returns table(day date, calls bigint, activations bigint)
language sql stable security invoker set search_path = public as $$
  select (l.call_date at time zone 'UTC')::date as day,
         count(*)::bigint as calls,
         count(*) filter (where l.is_activation)::bigint as activations
  from public.call_logs l
  where l.call_date >= _date_from and l.call_date <= _date_to
    and (_country_id is null or exists (
      select 1 from public.customers c where c.id = l.customer_id and c.country_id = _country_id
    ))
  group by 1
  order by 1;
$$;

-- 대시보드: 국가별 개통 수 (상태='activated')
create or replace function public.stats_country_activated()
returns table(country_id uuid, code text, activated bigint)
language sql stable security invoker set search_path = public as $$
  select co.id, co.code, count(c.id)::bigint
  from public.countries co
  left join public.customers c on c.country_id = co.id and c.status = 'activated'::customer_status
  where co.is_active = true
  group by co.id, co.code
  order by 3 desc;
$$;

-- 대시보드: 채널 성과 (현재 고객 + 개통)
create or replace function public.stats_channel_summary(_country_id uuid default null)
returns table(channel_id uuid, name text, customers bigint, activations bigint)
language sql stable security invoker set search_path = public as $$
  select ch.id, ch.name,
    count(c.id)::bigint as customers,
    count(c.id) filter (where c.status = 'activated'::customer_status)::bigint as activations
  from public.channels ch
  left join public.customers c on c.channel_id = ch.id
    and (_country_id is null or c.country_id = _country_id)
  where ch.is_active = true
  group by ch.id, ch.name;
$$;

-- 대시보드: 직원 랭킹 (콜수 + 개통 + 목표)
create or replace function public.stats_staff_ranking(_date_from timestamptz, _date_to timestamptz, _year int, _month int, _country_id uuid default null)
returns table(user_id uuid, display_name text, total_calls bigint, activated bigint, activation_target int)
language sql stable security invoker set search_path = public as $$
  with calls as (
    select l.staff_id, count(*)::bigint as cnt
    from public.call_logs l
    where l.call_date >= _date_from and l.call_date <= _date_to
      and (_country_id is null or exists (
        select 1 from public.customers c where c.id = l.customer_id and c.country_id = _country_id
      ))
    group by l.staff_id
  ),
  acts as (
    select c.assigned_to, count(*)::bigint as cnt
    from public.customers c
    where c.status = 'activated'::customer_status
      and (_country_id is null or c.country_id = _country_id)
    group by c.assigned_to
  )
  select p.id, p.display_name,
    coalesce(ca.cnt, 0), coalesce(ac.cnt, 0),
    coalesce(t.activation_target, 0)
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id and ur.role = 'staff'::app_role
  left join calls ca on ca.staff_id = p.id
  left join acts ac on ac.assigned_to = p.id
  left join public.targets t on t.user_id = p.id and t.year = _year and t.month = _month
  where p.is_active = true
  order by ac.cnt desc nulls last, ca.cnt desc nulls last;
$$;

-- 대시보드: 기간 내 전체 콜수 / 전체 고객수 / 월간 목표 합계
create or replace function public.stats_totals(_date_from timestamptz, _date_to timestamptz, _year int, _month int, _country_id uuid default null)
returns table(total_calls bigint, total_customers bigint, monthly_target_total bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*)::bigint from public.call_logs l
       where l.call_date >= _date_from and l.call_date <= _date_to
         and (_country_id is null or exists (
           select 1 from public.customers c where c.id = l.customer_id and c.country_id = _country_id
         ))),
    (select count(*)::bigint from public.customers c
       where (_country_id is null or c.country_id = _country_id)),
    (select coalesce(sum(t.activation_target), 0)::bigint from public.targets t
       where t.year = _year and t.month = _month);
$$;
