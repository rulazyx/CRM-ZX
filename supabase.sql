-- À coller une seule fois dans Supabase > SQL Editor > New query, puis « Run ».
-- Crée : la liste des comptes autorisés (avec leur rôle), les données partagées du garage,
-- et le dossier des photos. Seuls les comptes de la liste voient quelque chose.
-- Le tout premier compte qui se connecte devient automatiquement admin.

-- Comptes autorisés : l'admin y ajoute les emails de son équipe depuis l'appli.
create table if not exists public.crm_membres (
  email text primary key,
  role text not null default 'vendeur' check (role in ('admin', 'vendeur')),
  ajoute_le timestamptz not null default now()
);

-- Données du garage : une seule ligne JSON partagée par toute l'équipe.
create table if not exists public.crm_garage (
  id text primary key default 'garage',
  data jsonb not null default '{}'::jsonb,
  updated_at text not null
);

-- Rôle du compte connecté (null s'il n'est pas dans la liste).
create or replace function public.crm_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.crm_membres where email = lower(auth.jwt() ->> 'email');
$$;

-- Appelée par l'appli à la connexion : renvoie le rôle, et fait du premier compte l'admin.
create or replace function public.crm_moi() returns text
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(auth.jwt() ->> 'email');
  r text;
begin
  if auth.uid() is null then return null; end if;
  select role into r from public.crm_membres where email = e;
  if r is null and not exists (select 1 from public.crm_membres) then
    insert into public.crm_membres (email, role) values (e, 'admin');
    r := 'admin';
  end if;
  return r;
end $$;

alter table public.crm_membres enable row level security;
alter table public.crm_garage enable row level security;

drop policy if exists "Membres : lecture" on public.crm_membres;
create policy "Membres : lecture" on public.crm_membres for select to authenticated
  using (public.crm_role() is not null);
drop policy if exists "Membres : gérés par l'admin" on public.crm_membres;
create policy "Membres : gérés par l'admin" on public.crm_membres for all to authenticated
  using (public.crm_role() = 'admin') with check (public.crm_role() = 'admin');

drop policy if exists "Garage : équipe" on public.crm_garage;
create policy "Garage : équipe" on public.crm_garage for all to authenticated
  using (public.crm_role() is not null) with check (public.crm_role() is not null);

-- Mise à jour en direct entre le téléphone et l'ordinateur.
do $$ begin
  alter publication supabase_realtime add table public.crm_garage;
exception when duplicate_object then null; end $$;

-- Photos des véhicules : dossier privé, réservé à l'équipe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Photos : équipe" on storage.objects;
create policy "Photos : équipe" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and public.crm_role() is not null)
  with check (bucket_id = 'photos' and public.crm_role() is not null);
