-- Store admin-facing timestamps in Swedish local time (handles DST automatically).
-- Note: this intentionally uses timestamp without time zone for local wall-clock display.

alter table public.plans
  alter column created_at type timestamp using (created_at at time zone 'Europe/Stockholm'),
  alter column updated_at type timestamp using (updated_at at time zone 'Europe/Stockholm');

alter table public.plans
  alter column created_at set default timezone('Europe/Stockholm', now()),
  alter column updated_at set default timezone('Europe/Stockholm', now());

create or replace function public.plans_set_updated_at_stockholm()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('Europe/Stockholm', now());
  return new;
end;
$$;

drop trigger if exists plans_set_updated_at_stockholm on public.plans;
create trigger plans_set_updated_at_stockholm
before update on public.plans
for each row
execute function public.plans_set_updated_at_stockholm();

