-- ============================================================
-- UE CLUBISTE - PAYMENTS MODULE
-- Run AFTER schema.sql, matchs.sql and security_hardening.sql
-- in the Supabase SQL Editor.
--
-- Adds:
--   1) Membership card payment status on subscribers (admin-only).
--   2) Events + per-subscriber payment collection (admin-only).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Membership card payment status
-- ------------------------------------------------------------
alter table public.subscribers add column if not exists card_paid boolean not null default false;
alter table public.subscribers add column if not exists card_paid_at timestamptz;

-- Card payment is an administrative field: a subscriber must never be able
-- to mark their own card as paid through the client. Extend the existing
-- self-update guard trigger to protect these two columns as well.
create or replace function public.protect_subscriber_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if old.id is distinct from new.id
       or old.user_id is distinct from new.user_id
       or old.nom is distinct from new.nom
       or old.prenom is distinct from new.prenom
       or old.login_name is distinct from new.login_name
       or old.numero_abonnement is distinct from new.numero_abonnement
       or old.cin is distinct from new.cin
       or old.gender is distinct from new.gender
       or old.faculty_id is distinct from new.faculty_id
       or old.zone_id is distinct from new.zone_id
       or old.status is distinct from new.status
       or old.card_paid is distinct from new.card_paid
       or old.card_paid_at is distinct from new.card_paid_at
    then
      raise exception 'Only contact fields can be edited by a subscriber';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2) Events + payment collection
-- ------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 150),
  description text,
  amount numeric(10,2) not null default 0 check (amount >= 0),
  event_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, subscriber_id)
);

create index if not exists idx_event_payments_event on public.event_payments(event_id);
create index if not exists idx_event_payments_subscriber on public.event_payments(subscriber_id);

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events for each row execute function public.update_updated_at();
drop trigger if exists event_payments_updated_at on public.event_payments;
create trigger event_payments_updated_at before update on public.event_payments for each row execute function public.update_updated_at();

alter table public.events enable row level security;
alter table public.event_payments enable row level security;

revoke all on public.events from anon;
revoke all on public.event_payments from anon;
revoke all on public.events from authenticated;
revoke all on public.event_payments from authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_payments to authenticated;

-- Admin-only feature end to end: payment collection is managed by admins,
-- subscribers are never shown this data on their own account.
drop policy if exists events_admin_all on public.events;
create policy events_admin_all
on public.events for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists event_payments_admin_all on public.event_payments;
create policy event_payments_admin_all
on public.event_payments for all to authenticated
using (public.is_admin())
with check (public.is_admin());
