create or replace function public.admin_set_profile_department(_user_id uuid, _department text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  update public.profiles
     set department = nullif(btrim(coalesce(_department, '')), ''),
         updated_at = now()
   where id = _user_id;
end;
$$;

revoke all on function public.admin_set_profile_department(uuid, text) from public, anon;
grant execute on function public.admin_set_profile_department(uuid, text) to authenticated;