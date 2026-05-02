create table if not exists public.address_book (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_name text not null unique,
  email text not null,
  aliases text[] not null default '{}',
  verified boolean not null default true,
  created_at timestamp not null default timezone('Europe/Stockholm', now()),
  updated_at timestamp not null default timezone('Europe/Stockholm', now())
);

create table if not exists public.contact_suggestions (
  id uuid primary key default gen_random_uuid(),
  calendar_name text not null,
  normalized_name text not null,
  email text not null,
  role text not null default '',
  service_date date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp not null default timezone('Europe/Stockholm', now()),
  handled_at timestamp
);

create index if not exists address_book_normalized_name_idx on public.address_book (normalized_name);
create index if not exists contact_suggestions_status_idx on public.contact_suggestions (status);
create index if not exists contact_suggestions_normalized_name_idx on public.contact_suggestions (normalized_name);

create or replace function public.set_updated_at_stockholm()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('Europe/Stockholm', now());
  return new;
end;
$$;

drop trigger if exists address_book_set_updated_at_stockholm on public.address_book;
create trigger address_book_set_updated_at_stockholm
before update on public.address_book
for each row
execute function public.set_updated_at_stockholm();

alter table public.address_book enable row level security;
alter table public.contact_suggestions enable row level security;

drop policy if exists address_book_no_direct_select on public.address_book;
create policy address_book_no_direct_select on public.address_book
for select using (false);

drop policy if exists address_book_no_direct_insert on public.address_book;
create policy address_book_no_direct_insert on public.address_book
for insert with check (false);

drop policy if exists address_book_no_direct_update on public.address_book;
create policy address_book_no_direct_update on public.address_book
for update using (false) with check (false);

drop policy if exists address_book_no_direct_delete on public.address_book;
create policy address_book_no_direct_delete on public.address_book
for delete using (false);

drop policy if exists contact_suggestions_no_direct_select on public.contact_suggestions;
create policy contact_suggestions_no_direct_select on public.contact_suggestions
for select using (false);

drop policy if exists contact_suggestions_no_direct_insert on public.contact_suggestions;
create policy contact_suggestions_no_direct_insert on public.contact_suggestions
for insert with check (false);

drop policy if exists contact_suggestions_no_direct_update on public.contact_suggestions;
create policy contact_suggestions_no_direct_update on public.contact_suggestions
for update using (false) with check (false);

drop policy if exists contact_suggestions_no_direct_delete on public.contact_suggestions;
create policy contact_suggestions_no_direct_delete on public.contact_suggestions
for delete using (false);

