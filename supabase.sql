-- À coller dans Supabase > SQL Editor > New query, puis « Run ». Peut être relancé sans risque.
-- Chaque garage inscrit a sa propre entreprise : ses données, ses photos et ses documents
-- ne sont visibles que par les comptes de cette entreprise (règles RLS vérifiées par la base).
-- Qui crée son compte avec un nom d'entreprise devient l'admin de cette nouvelle entreprise ;
-- un collègue ajouté par l'admin rejoint directement l'entreprise de l'admin.

-- Nettoyage des tables de la version précédente (aucune donnée réelle n'y avait encore été mise).
drop table if exists public.crm_garage;
drop table if exists public.crm_data;
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'crm_membres')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_membres' and column_name = 'entreprise_id') then
    drop table public.crm_membres;
  end if;
end $$;

-- Entreprises : une ligne par garage, avec toutes ses données du CRM en JSON.
create table if not exists public.crm_entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at text not null default '',
  cree_le timestamptz not null default now()
);

-- Comptes : chaque email appartient à une seule entreprise, avec un rôle.
create table if not exists public.crm_membres (
  email text primary key,
  entreprise_id uuid not null references public.crm_entreprises (id) on delete cascade,
  role text not null default 'vendeur' check (role in ('admin', 'vendeur')),
  ajoute_le timestamptz not null default now()
);

-- Entreprise et rôle du compte connecté (null s'il n'appartient à aucune entreprise).
create or replace function public.crm_entreprise() returns uuid
language sql stable security definer set search_path = public as $$
  select entreprise_id from public.crm_membres where email = lower(auth.jwt() ->> 'email');
$$;
create or replace function public.crm_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.crm_membres where email = lower(auth.jwt() ->> 'email');
$$;

-- Appelée par l'appli à la connexion. Si le compte n'appartient à aucune entreprise et qu'il a
-- donné un nom d'entreprise à l'inscription, l'entreprise est créée et il en devient l'admin.
create or replace function public.crm_moi() returns json
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(auth.jwt() ->> 'email');
  m public.crm_membres%rowtype;
  nom_entreprise text;
  eid uuid;
begin
  if auth.uid() is null then return null; end if;
  select * into m from public.crm_membres where email = e;
  if not found then
    nom_entreprise := nullif(trim(auth.jwt() -> 'user_metadata' ->> 'entreprise'), '');
    if nom_entreprise is null then return null; end if;
    insert into public.crm_entreprises (nom) values (nom_entreprise) returning id into eid;
    insert into public.crm_membres (email, entreprise_id, role) values (e, eid, 'admin') returning * into m;
  end if;
  return json_build_object('role', m.role, 'entreprise_id', m.entreprise_id,
    'nom', (select nom from public.crm_entreprises where id = m.entreprise_id));
end $$;

alter table public.crm_entreprises enable row level security;
alter table public.crm_membres enable row level security;

-- Une entreprise ne voit et ne modifie que sa propre ligne. Création uniquement via crm_moi().
drop policy if exists "Entreprise : lecture" on public.crm_entreprises;
create policy "Entreprise : lecture" on public.crm_entreprises for select to authenticated
  using (id = public.crm_entreprise());
drop policy if exists "Entreprise : modification" on public.crm_entreprises;
create policy "Entreprise : modification" on public.crm_entreprises for update to authenticated
  using (id = public.crm_entreprise()) with check (id = public.crm_entreprise());

-- L'équipe voit ses collègues ; seul l'admin ajoute ou retire, et seulement dans sa propre entreprise.
drop policy if exists "Membres : lecture" on public.crm_membres;
create policy "Membres : lecture" on public.crm_membres for select to authenticated
  using (entreprise_id = public.crm_entreprise());
drop policy if exists "Membres : ajout par l'admin" on public.crm_membres;
create policy "Membres : ajout par l'admin" on public.crm_membres for insert to authenticated
  with check (public.crm_role() = 'admin' and entreprise_id = public.crm_entreprise());
drop policy if exists "Membres : modification par l'admin" on public.crm_membres;
create policy "Membres : modification par l'admin" on public.crm_membres for update to authenticated
  using (public.crm_role() = 'admin' and entreprise_id = public.crm_entreprise())
  with check (public.crm_role() = 'admin' and entreprise_id = public.crm_entreprise());
drop policy if exists "Membres : retrait par l'admin" on public.crm_membres;
create policy "Membres : retrait par l'admin" on public.crm_membres for delete to authenticated
  using (public.crm_role() = 'admin' and entreprise_id = public.crm_entreprise() and email <> lower(auth.jwt() ->> 'email'));

-- Mise à jour en direct entre le téléphone et l'ordinateur.
do $$ begin
  alter publication supabase_realtime add table public.crm_entreprises;
exception when duplicate_object then null; end $$;

-- Fichiers privés : photos des véhicules et documents (RIB…). Chaque fichier est rangé dans
-- un dossier au nom de l'entreprise, et seule cette entreprise peut y accéder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Photos : équipe" on storage.objects;
drop policy if exists "Fichiers : entreprise" on storage.objects;
create policy "Fichiers : entreprise" on storage.objects for all to authenticated
  using (bucket_id in ('photos', 'documents') and (storage.foldername(name))[1] = public.crm_entreprise()::text)
  with check (bucket_id in ('photos', 'documents') and (storage.foldername(name))[1] = public.crm_entreprise()::text);
