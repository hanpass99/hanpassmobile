create or replace function public.skip_old_received_sheet_rows()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.signup_date < date '2026-10-01' and (
       (new.pool = 'activation_request' and coalesce(new.notes,'') like '접수완료 시트 자동 등록%')
    or (new.pool = 'google_form_activation' and coalesce(new.notes,'') like '구글폼%자동 등록%')
  ) then
    return null;
  end if;
  return new;
end $$;