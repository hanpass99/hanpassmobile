create or replace function public.skip_old_received_sheet_rows()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.pool = 'activation_request'
     and new.signup_date < date '2026-10-01'
     and coalesce(new.notes,'') like '접수완료 시트 자동 등록%' then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists trg_skip_old_received_sheet_rows on public.customers;
create trigger trg_skip_old_received_sheet_rows
before insert on public.customers
for each row execute function public.skip_old_received_sheet_rows();