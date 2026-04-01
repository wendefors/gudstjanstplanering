create extension if not exists pgcrypto;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  payload jsonb not null,
  share_token text not null unique,
  share_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_service_date_idx on public.plans (service_date);
create index if not exists plans_share_token_idx on public.plans (share_token);

alter table public.plans enable row level security;

-- Ingen direkt åtkomst från klienttabeller. Edge function använder service role.
drop policy if exists plans_no_direct_select on public.plans;
create policy plans_no_direct_select on public.plans
for select using (false);

drop policy if exists plans_no_direct_insert on public.plans;
create policy plans_no_direct_insert on public.plans
for insert with check (false);

drop policy if exists plans_no_direct_update on public.plans;
create policy plans_no_direct_update on public.plans
for update using (false) with check (false);

drop policy if exists plans_no_direct_delete on public.plans;
create policy plans_no_direct_delete on public.plans
for delete using (false);
