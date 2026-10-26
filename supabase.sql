-- À coller dans Supabase > SQL Editor > New query. AVANT « Run », remplace TON_EMAIL_ICI (plus bas,
-- section Super-admin) par l'email de ton compte. Peut être relancé sans risque.
-- Chaque garage inscrit a sa propre entreprise : ses données, ses photos et ses documents
-- ne sont visibles que par les comptes de cette entreprise (règles RLS vérifiées par la base).
-- Pas d'inscription libre : le super-admin (Anthony) crée chaque garage depuis l'appli, avec un mot de passe
-- de départ (12345678) que le garage change à sa première connexion. Aucun email n'est envoyé.
-- Le super-admin est désigné par son email dans ce script (jamais le compte démo).

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
  doit_changer_mdp boolean not null default false,
  ajoute_le timestamptz not null default now()
);
alter table public.crm_membres add column if not exists doit_changer_mdp boolean not null default false;
alter table public.crm_entreprises add column if not exists demo boolean not null default false;

-- Super-admin : crée les comptes des garages clients.
create table if not exists public.crm_superadmins (email text primary key);
alter table public.crm_superadmins enable row level security;
-- ⬇️ Remplace TON_EMAIL_ICI par l'email de ton compte (garde les apostrophes).
insert into public.crm_superadmins (email)
  select lower(trim(x)) from (values ('anthony.lamer@hotmail.fr')) v (x) where x like '%@%'
  on conflict do nothing;
delete from public.crm_superadmins where email like '%@demo.crmzx.re';

-- Ton compte créé avant cette version n'a plus besoin de confirmer son email.
update auth.users set email_confirmed_at = now()
  where email_confirmed_at is null and lower(email) in (select email from public.crm_superadmins);

-- Entreprise et rôle du compte connecté (null s'il n'appartient à aucune entreprise).
create or replace function public.crm_entreprise() returns uuid
language sql stable security definer set search_path = public as $$
  select entreprise_id from public.crm_membres where email = lower(auth.jwt() ->> 'email');
$$;
create or replace function public.crm_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.crm_membres where email = lower(auth.jwt() ->> 'email');
$$;

-- Crée un compte de connexion (email + mot de passe) sans envoyer d'email. Réservée aux fonctions ci-dessous.
create or replace function public.crm__utilisateur(p_email text, p_mdp text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is not null then return uid; end if;
  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', lower(p_email),
    extensions.crypt(p_mdp, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', lower(p_email), 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;
revoke execute on function public.crm__utilisateur(text, text) from public, anon, authenticated;

create or replace function public.crm_est_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(auth.jwt() ->> 'email') not like '%@demo.crmzx.re'
    and exists (select 1 from public.crm_superadmins where lower(trim(email)) = lower(auth.jwt() ->> 'email'));
$$;

-- Appelée par l'appli à la connexion : renvoie le rôle, l'entreprise, et s'il faut changer le mot de passe.
-- Le super-admin reçoit sa propre entreprise à sa première connexion.
create or replace function public.crm_moi() returns json
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(auth.jwt() ->> 'email');
  m public.crm_membres%rowtype;
  eid uuid;
begin
  if auth.uid() is null then return null; end if;
  select * into m from public.crm_membres where lower(email) = e;
  if m.email is null and public.crm_est_superadmin() then
    insert into public.crm_entreprises (nom)
      values (coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'entreprise'), ''), 'Mon garage')) returning id into eid;
    insert into public.crm_membres (email, entreprise_id, role) values (e, eid, 'admin') returning * into m;
  end if;
  if m.email is null then return null; end if;
  return json_build_object('role', m.role, 'entreprise_id', m.entreprise_id, 'doit_changer_mdp', m.doit_changer_mdp,
    'superadmin', public.crm_est_superadmin(),
    'nom', (select nom from public.crm_entreprises where id = m.entreprise_id),
    'demo', (select demo from public.crm_entreprises where id = m.entreprise_id));
end $$;

drop function if exists public.crm_compte_existe(text);

-- Après le changement de mot de passe.
create or replace function public.crm_mdp_change() returns void
language sql security definer set search_path = public as $$
  update public.crm_membres set doit_changer_mdp = false where email = lower(auth.jwt() ->> 'email');
$$;

-- Super-admin : crée un garage client (entreprise + compte admin, mot de passe 12345678).
create or replace function public.crm_creer_garage(p_nom text, p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare eid uuid; e text := lower(trim(p_email));
begin
  if not public.crm_est_superadmin() then raise exception 'Réservé au super-admin'; end if;
  if coalesce(trim(p_nom), '') = '' or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Nom ou email invalide'; end if;
  if exists (select 1 from public.crm_membres where email = e) then raise exception 'Cet email a déjà un compte'; end if;
  perform public.crm__utilisateur(e, '12345678');
  insert into public.crm_entreprises (nom) values (trim(p_nom)) returning id into eid;
  insert into public.crm_membres (email, entreprise_id, role, doit_changer_mdp) values (e, eid, 'admin', true);
  return json_build_object('entreprise_id', eid, 'email', e);
end $$;

-- Super-admin : liste des garages clients (nom et comptes seulement, jamais leurs données).
create or replace function public.crm_garages() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_est_superadmin() then raise exception 'Réservé au super-admin'; end if;
  return coalesce((select json_agg(g order by g.cree_le desc) from (
    select en.id, en.nom, en.demo, en.cree_le,
      (select json_agg(json_build_object('email', mb.email, 'role', mb.role, 'doit_changer_mdp', mb.doit_changer_mdp) order by mb.ajoute_le)
         from public.crm_membres mb where mb.entreprise_id = en.id) as comptes
    from public.crm_entreprises en) g), '[]'::json);
end $$;

-- Admin d'un garage : ajoute un collègue (compte créé avec le mot de passe 12345678).
create or replace function public.crm_ajouter_membre(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if public.crm_role() <> 'admin' then raise exception 'Réservé à l''admin du garage'; end if;
  if (select demo from public.crm_entreprises where id = public.crm_entreprise()) then raise exception 'Indisponible en démo'; end if;
  if p_role not in ('admin', 'vendeur') or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email invalide'; end if;
  if exists (select 1 from public.crm_membres where email = e) then raise exception 'Cet email a déjà un compte'; end if;
  perform public.crm__utilisateur(e, '12345678');
  insert into public.crm_membres (email, entreprise_id, role, doit_changer_mdp) values (e, public.crm_entreprise(), p_role, true);
end $$;

-- Remet le mot de passe d'un compte à 12345678 (super-admin, ou admin pour son équipe).
create or replace function public.crm_reinit_mdp(p_email text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
declare e text := lower(trim(p_email));
begin
  if not (public.crm_est_superadmin()
          or (public.crm_role() = 'admin' and exists (select 1 from public.crm_membres where email = e and entreprise_id = public.crm_entreprise()))) then
    raise exception 'Non autorisé';
  end if;
  update auth.users set encrypted_password = extensions.crypt('12345678', extensions.gen_salt('bf')), updated_at = now() where lower(email) = e;
  update public.crm_membres set doit_changer_mdp = true where email = e;
end $$;

revoke execute on function public.crm_creer_garage(text, text), public.crm_garages(), public.crm_ajouter_membre(text, text),
  public.crm_reinit_mdp(text), public.crm_moi(), public.crm_mdp_change() from public, anon;

-- Compte démo : identifiant « test », mot de passe « test » (garage fictif, données d'exemple ajoutées par l'appli).
do $$
declare eid uuid;
begin
  perform public.crm__utilisateur('test@demo.crmzx.re', 'test');
  if not exists (select 1 from public.crm_membres where email = 'test@demo.crmzx.re') then
    insert into public.crm_entreprises (nom, demo) values ('Garage Démo', true) returning id into eid;
    insert into public.crm_membres (email, entreprise_id, role) values ('test@demo.crmzx.re', eid, 'admin');
  end if;
end $$;

alter table public.crm_entreprises enable row level security;
alter table public.crm_membres enable row level security;

-- Une entreprise ne voit et ne modifie que sa propre ligne. Création uniquement via les fonctions.
drop policy if exists "Entreprise : lecture" on public.crm_entreprises;
create policy "Entreprise : lecture" on public.crm_entreprises for select to authenticated
  using (id = public.crm_entreprise());
drop policy if exists "Entreprise : modification" on public.crm_entreprises;
create policy "Entreprise : modification" on public.crm_entreprises for update to authenticated
  using (id = public.crm_entreprise()) with check (id = public.crm_entreprise());

-- L'équipe voit ses collègues ; seul l'admin retire, et seulement dans sa propre entreprise.
drop policy if exists "Membres : lecture" on public.crm_membres;
create policy "Membres : lecture" on public.crm_membres for select to authenticated
  using (entreprise_id = public.crm_entreprise());
-- Ajouts et changements de rôle passent par les fonctions ci-dessus (création du compte de connexion).
drop policy if exists "Membres : ajout par l'admin" on public.crm_membres;
drop policy if exists "Membres : modification par l'admin" on public.crm_membres;
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
