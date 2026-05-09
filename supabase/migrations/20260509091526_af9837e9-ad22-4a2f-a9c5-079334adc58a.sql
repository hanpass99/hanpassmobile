
-- ===== ENUMS =====
create type public.app_role as enum ('admin', 'staff');
create type public.customer_status as enum ('new', 'contacted', 'in_progress', 'activated', 'failed', 'do_not_call');
create type public.call_result as enum ('no_answer', 'wrong_number', 'callback', 'not_interested', 'interested', 'activated', 'failed');

-- ===== PROFILES =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  department text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ===== USER ROLES =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ===== AUTO PROFILE + ROLE ON SIGNUP =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, display_name, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'department'
  );

  select count(*) = 0 into is_first from public.user_roles;
  insert into public.user_roles(user_id, role)
  values (new.id, case when is_first then 'admin'::app_role else 'staff'::app_role end);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== CHANNELS =====
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#3b82f6',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.channels enable row level security;

-- ===== COUNTRIES =====
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ko text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.countries enable row level security;

-- ===== CUSTOMERS =====
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  country_id uuid references public.countries(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  signup_date date not null default current_date,
  assigned_to uuid references auth.users(id) on delete set null,
  status customer_status not null default 'new',
  notes text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create index idx_customers_assigned on public.customers(assigned_to);
create index idx_customers_status on public.customers(status);

-- ===== CALL LOGS =====
create table public.call_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  call_date timestamptz not null default now(),
  duration_sec integer not null default 0,
  result call_result not null,
  notes text,
  is_activation boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.call_logs enable row level security;
create index idx_call_logs_staff on public.call_logs(staff_id);
create index idx_call_logs_date on public.call_logs(call_date);

-- ===== TARGETS =====
create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  call_target int not null default 0,
  activation_target int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, year, month)
);
alter table public.targets enable row level security;

-- ===== updated_at trigger =====
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger targets_touch before update on public.targets for each row execute function public.touch_updated_at();

-- ===== RLS POLICIES =====
-- profiles: everyone authenticated can read; users update self; admin full
create policy "profiles_read" on public.profiles for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_admin_all" on public.profiles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- user_roles: read for self & admin; admin manage
create policy "user_roles_read_self" on public.user_roles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));
create policy "user_roles_admin_manage" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- channels / countries: all read; admin manage
create policy "channels_read" on public.channels for select to authenticated using (true);
create policy "channels_admin" on public.channels for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "countries_read" on public.countries for select to authenticated using (true);
create policy "countries_admin" on public.countries for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- customers: all read; staff can update assigned ones; admin full
create policy "customers_read" on public.customers for select to authenticated using (true);
create policy "customers_insert" on public.customers for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "customers_update_assigned" on public.customers for update to authenticated using (assigned_to = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "customers_delete_admin" on public.customers for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- call_logs: read all; staff insert own; admin full
create policy "call_logs_read" on public.call_logs for select to authenticated using (true);
create policy "call_logs_insert_self" on public.call_logs for insert to authenticated with check (staff_id = auth.uid());
create policy "call_logs_admin_modify" on public.call_logs for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "call_logs_admin_delete" on public.call_logs for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- targets: all read; admin manage
create policy "targets_read" on public.targets for select to authenticated using (true);
create policy "targets_admin" on public.targets for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
