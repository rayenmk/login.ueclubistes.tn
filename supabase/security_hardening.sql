-- ============================================================
-- UE CLUBISTE - SECURITY HARDENING
-- Run AFTER schema.sql and matchs.sql in Supabase SQL Editor.
-- This script is idempotent where practical.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) Profile hardening
-- ------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_active boolean not null default true;

-- Never trust auth.users metadata for role assignment.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, display_name, role, must_change_password, is_active)
  values(
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data->>'display_name','Utilisateur'),100),
    'SUBSCRIBER',
    true,
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop policy if exists "profiles admin update" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;

-- Only read own profile or admins. No client can change role/status.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

-- Secure RPC for first-password completion.
create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set must_change_password = false,
      updated_at = now()
  where id = auth.uid()
    and is_active = true;

  if not found then
    raise exception 'Active profile not found';
  end if;
end;
$$;

revoke all on function public.complete_password_change() from public;
grant execute on function public.complete_password_change() to authenticated;

-- ------------------------------------------------------------
-- 2) Strong data validation
-- ------------------------------------------------------------
alter table public.subscribers drop constraint if exists subscribers_login_name_format;
alter table public.subscribers add constraint subscribers_login_name_format
  check (login_name ~ '^[A-Z0-9_-]{3,40}$');

alter table public.subscribers drop constraint if exists subscribers_gender_check;
alter table public.subscribers add constraint subscribers_gender_check
  check (gender in ('MALE','FEMALE'));

alter table public.subscribers drop constraint if exists subscribers_status_check;

-- ------------------------------------------------------------
-- 3) Strict table privileges
-- RLS is still required; privileges prevent accidental exposure.
-- ------------------------------------------------------------
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;

revoke all on public.subscribers from anon;
revoke all on public.subscribers from authenticated;
grant select on public.subscribers to authenticated;
-- Subscribers can edit only these fields through the RLS self-update policy.
grant update(phone,email,adresse) on public.subscribers to authenticated;

revoke all on public.faculties from anon;
revoke all on public.faculties from authenticated;
grant select on public.faculties to authenticated;
grant insert,update,delete on public.faculties to authenticated;

revoke all on public.zones from anon;
revoke all on public.zones from authenticated;
grant select on public.zones to authenticated;
grant insert,update,delete on public.zones to authenticated;

-- ------------------------------------------------------------
-- 4) Subscriber RLS - no account takeover through API
-- ------------------------------------------------------------
drop policy if exists "subscriber self read" on public.subscribers;
create policy "subscriber self read"
on public.subscribers for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "subscriber self update" on public.subscribers;
create policy "subscriber self update"
on public.subscribers for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "admin subscriber insert" on public.subscribers;
create policy "admin subscriber insert"
on public.subscribers for insert to authenticated
with check (public.is_admin());

drop policy if exists "admin subscriber delete" on public.subscribers;
create policy "admin subscriber delete"
on public.subscribers for delete to authenticated
using (public.is_admin());

-- ------------------------------------------------------------
-- 5) Reference data validation
-- ------------------------------------------------------------
alter table public.faculties drop constraint if exists faculties_name_length;
alter table public.faculties add constraint faculties_name_length check (char_length(trim(name)) between 1 and 150);
alter table public.zones drop constraint if exists zones_name_length;
alter table public.zones add constraint zones_name_length check (char_length(trim(name)) between 1 and 150);

-- ------------------------------------------------------------
-- 6) Security audit log + rate-limit source
-- ------------------------------------------------------------
create table if not exists public.security_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action ~ '^[A-Z0-9_:-]{2,80}$'),
  target_id uuid,
  success boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_audit_actor_action_time_idx
  on public.security_audit_logs(actor_id, action, created_at desc);
create index if not exists security_audit_created_idx
  on public.security_audit_logs(created_at desc);

alter table public.security_audit_logs enable row level security;
revoke all on public.security_audit_logs from anon;
revoke all on public.security_audit_logs from authenticated;
-- No client policy: only service-key Edge Functions write/read logs.

-- ------------------------------------------------------------
-- 7) Prevent role escalation through direct SQL/API updates
-- ------------------------------------------------------------
create or replace function public.protect_profile_privilege_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role
     or old.is_active is distinct from new.is_active
     or old.id is distinct from new.id
  then
    if auth.uid() is not null and auth.role() <> 'service_role' then
      raise exception 'Protected profile fields can only be changed server-side';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privilege_fields on public.profiles;
create trigger protect_profile_privilege_fields
before update on public.profiles
for each row execute function public.protect_profile_privilege_fields();
revoke all on function public.protect_profile_privilege_fields() from public;

-- ------------------------------------------------------------
-- 8) Match security: eliminate direct subscriber writes and race conditions
-- ------------------------------------------------------------
-- Revoke direct writes; participants are changed only through RPC below.
revoke insert, update, delete on public.match_participations from authenticated;

create or replace function public.set_match_participation(
  p_match_id uuid,
  p_zone_id uuid
)
returns public.match_participations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber_id uuid;
  v_gender text;
  v_zone_key text;
  v_available boolean;
  v_capacity integer;
  v_current integer;
  v_row public.match_participations;
begin
  select id, gender into v_subscriber_id, v_gender
  from public.subscribers
  where user_id = auth.uid() and status = 'ACTIVE'
  for update;

  if v_subscriber_id is null then raise exception 'Active subscriber required'; end if;

  perform 1 from public.matches where id=p_match_id and is_active=true for update;
  if not found then raise exception 'Match unavailable'; end if;

  select zone_key,is_available,capacity into v_zone_key,v_available,v_capacity
  from public.match_zones where id=p_zone_id and match_id=p_match_id for update;
  if v_zone_key is null or not v_available then raise exception 'Zone unavailable'; end if;
  if v_gender='FEMALE' and v_zone_key in ('VIRAGE_1','VIRAGE_2') then raise exception 'Zone unavailable for this subscriber'; end if;

  if v_capacity is not null then
    select count(*) into v_current from public.match_participations
    where match_id=p_match_id and zone_id=p_zone_id and subscriber_id<>v_subscriber_id;
    if v_current >= v_capacity then raise exception 'Zone capacity reached'; end if;
  end if;

  insert into public.match_participations(match_id,subscriber_id,zone_id)
  values(p_match_id,v_subscriber_id,p_zone_id)
  on conflict(match_id,subscriber_id) do update set zone_id=excluded.zone_id,updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.set_match_participation(uuid,uuid) from public;
grant execute on function public.set_match_participation(uuid,uuid) to authenticated;

create or replace function public.remove_match_participation(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.match_participations mp
  using public.subscribers s
  where mp.match_id=p_match_id and mp.subscriber_id=s.id and s.user_id=auth.uid();
end;
$$;
revoke all on function public.remove_match_participation(uuid) from public;
grant execute on function public.remove_match_participation(uuid) to authenticated;

-- Keep SELECT only for participant visibility.
drop policy if exists match_participations_insert on public.match_participations;
drop policy if exists match_participations_update on public.match_participations;
drop policy if exists match_participations_delete on public.match_participations;

create policy match_participations_select
on public.match_participations for select to authenticated
using (
  public.is_admin()
  or subscriber_id in (select id from public.subscribers where user_id=auth.uid())
);

-- ------------------------------------------------------------
-- 9) Default security grants for match read-only client access
-- ------------------------------------------------------------
revoke all on public.matches from anon;
revoke all on public.match_zones from anon;
revoke all on public.match_participations from anon;
grant select on public.matches,public.match_zones,public.match_participations to authenticated;

-- ------------------------------------------------------------
-- 10) Cleanup policy: audit data is not public
-- ------------------------------------------------------------
comment on table public.security_audit_logs is 'Server-side security audit log. Never expose directly to browser clients.';

-- ------------------------------------------------------------
-- 11) Subscriber self-update field lock
-- ------------------------------------------------------------
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
    then
      raise exception 'Only contact fields can be edited by a subscriber';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_subscriber_self_update on public.subscribers;
create trigger protect_subscriber_self_update
before update on public.subscribers
for each row execute function public.protect_subscriber_self_update();
revoke all on function public.protect_subscriber_self_update() from public;

-- Admins and subscribers both receive UPDATE table privilege; the trigger above
-- limits subscribers to phone/email/adresse while RLS still controls the rows.
revoke all on public.subscribers from authenticated;
grant select, update on public.subscribers to authenticated;

-- ------------------------------------------------------------
-- 12) Function privileges: no anonymous invocation
-- ------------------------------------------------------------
revoke all on function public.set_match_participation(uuid,uuid) from anon;
revoke all on function public.remove_match_participation(uuid) from anon;
revoke all on function public.complete_password_change() from anon;

-- ------------------------------------------------------------
-- 13) Useful security views for administrators (no direct client access)
-- ------------------------------------------------------------
comment on function public.set_match_participation(uuid,uuid) is 'Atomic, gender-aware and capacity-aware match placement. Client may execute only as authenticated user.';
comment on function public.complete_password_change() is 'Allows an authenticated user to clear only their own first-login flag.';
