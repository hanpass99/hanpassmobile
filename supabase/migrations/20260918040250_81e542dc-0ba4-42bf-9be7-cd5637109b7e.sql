create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
  is_admin_created boolean;
  v_company text;
begin
  is_admin_created := coalesce(new.raw_user_meta_data->>'created_by_admin', '') = 'true';
  v_company := new.raw_user_meta_data->>'company';
  if v_company is null or v_company not in ('한패스', '한패스 모바일') then
    v_company := '한패스 모바일';
  end if;

  insert into public.profiles (id, display_name, department, company, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'department',
    v_company,
    is_admin_created
  );

  select count(*) = 0 into is_first from public.user_roles;
  if is_first then
    insert into public.user_roles(user_id, role) values (new.id, 'admin'::app_role);
    update public.profiles set is_active = true where id = new.id;
  elsif is_admin_created then
    insert into public.user_roles(user_id, role) values (new.id, 'staff'::app_role);
  end if;

  return new;
end;
$$;