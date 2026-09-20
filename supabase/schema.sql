-- UE Clubiste database
-- Run this in Supabase SQL Editor.
create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('ADMIN','SUBSCRIBER'); exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_status as enum ('ACTIVE','INACTIVE'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'SUBSCRIBER',
  display_name text,
  email text,
  must_change_password boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;

create table if not exists public.faculties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  nom text not null,
  prenom text not null,
  login_name text not null unique,
  numero_abonnement text not null unique,
  phone text,
  email text,
  cin text not null,
  photo_url text,
  adresse text,
  faculty_id uuid references public.faculties(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  status public.subscription_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.v_member_cards as
select
  s.id,
  s.user_id,
  s.nom,
  s.prenom,
  s.login_name,
  s.numero_abonnement,
  s.phone,
  s.email,
  s.cin,
  s.photo_url,
  s.adresse,
  s.status,
  s.created_at,
  s.updated_at,
  f.name as faculty_name,
  z.name as zone_name,
  s.gender
from public.subscribers s
left join public.faculties f on f.id = s.faculty_id
left join public.zones z on z.id = s.zone_id;

create index if not exists subscribers_search_idx on public.subscribers
  using gin (to_tsvector('simple', coalesce(nom,'') || ' ' || coalesce(prenom,'') || ' ' || coalesce(cin,'') || ' ' || coalesce(numero_abonnement,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email,'') || ' ' || coalesce(login_name,'')));

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at();
drop trigger if exists faculties_updated_at on public.faculties;
create trigger faculties_updated_at before update on public.faculties for each row execute function public.update_updated_at();
drop trigger if exists zones_updated_at on public.zones;
create trigger zones_updated_at before update on public.zones for each row execute function public.update_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='ADMIN') $$;

alter table public.profiles enable row level security;
alter table public.faculties enable row level security;
alter table public.zones enable row level security;
alter table public.subscribers enable row level security;

create policy "profiles self read" on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy "profiles admin update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy "faculties authenticated read" on public.faculties for select to authenticated using (true);
create policy "faculties admin write" on public.faculties for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "zones authenticated read" on public.zones for select to authenticated using (true);
create policy "zones admin write" on public.zones for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "subscriber self read" on public.subscribers for select using (user_id=auth.uid() or public.is_admin());
create policy "subscriber self update" on public.subscribers for update using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
create policy "admin subscriber insert" on public.subscribers for insert to authenticated with check (public.is_admin());
create policy "admin subscriber delete" on public.subscribers for delete to authenticated using (public.is_admin());

-- Trigger creates a default profile when an Auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id, email, display_name, role, must_change_password)
  values(new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name','Utilisateur'),
         coalesce((new.raw_user_meta_data->>'role')::public.app_role,'SUBSCRIBER'), true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row execute procedure public.handle_new_user();

-- IMPORTANT: create your first ADMIN through Supabase Auth dashboard,
-- then run:
-- update public.profiles set role='ADMIN', display_name='Administrateur'
-- where id='AUTH_USER_UUID';
