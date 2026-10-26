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
-- (l'ancienne version renvoyait du texte : on la retire avant de la recréer)
drop function if exists public.crm_moi();
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

-- Vitrine en ligne : une page publique par garage, avec ses véhicules disponibles (copie publiée par l'appli,
-- sans prix d'achat ni données clients). Les visiteurs ne lisent que cette copie, par une fonction.
create table if not exists public.crm_vitrine (
  entreprise_id uuid primary key references public.crm_entreprises (id) on delete cascade,
  slug text unique not null,
  actif boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  photos text[] not null default '{}',
  maj_le timestamptz not null default now()
);
alter table public.crm_vitrine enable row level security;
drop policy if exists "Vitrine : équipe" on public.crm_vitrine;
create policy "Vitrine : équipe" on public.crm_vitrine for select to authenticated
  using (entreprise_id = public.crm_entreprise());

create or replace function public.crm_vitrine_publier(p_slug text, p_actif boolean, p_data jsonb, p_photos text[]) returns json
language plpgsql security definer set search_path = public as $$
declare eid uuid := public.crm_entreprise(); s text := lower(trim(p_slug));
begin
  if eid is null then raise exception 'Compte non rattaché à un garage'; end if;
  if s !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'Adresse invalide : 3 à 40 lettres, chiffres ou tirets'; end if;
  if exists (select 1 from public.crm_vitrine where slug = s and entreprise_id <> eid) then raise exception 'Cette adresse est déjà prise par un autre garage'; end if;
  insert into public.crm_vitrine (entreprise_id, slug, actif, data, photos, maj_le)
  values (eid, s, p_actif, p_data,
    (select coalesce(array_agg(x), '{}') from unnest(p_photos) x where x like eid::text || '/%'), now())
  on conflict (entreprise_id) do update set slug = excluded.slug, actif = excluded.actif, data = excluded.data, photos = excluded.photos, maj_le = now();
  return json_build_object('slug', s);
end $$;

create or replace function public.crm_vitrine_lire(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('data', data, 'maj_le', maj_le) from public.crm_vitrine where slug = lower(trim(p_slug)) and actif;
$$;
grant execute on function public.crm_vitrine_lire(text) to anon, authenticated;

-- Les photos des véhicules publiés sont lisibles par les visiteurs de la vitrine (et seulement celles-là).
create or replace function public.crm_photo_publique(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_vitrine where actif and p_name = any (photos));
$$;
grant execute on function public.crm_photo_publique(text) to anon, authenticated;
drop policy if exists "Photos : vitrine" on storage.objects;
create policy "Photos : vitrine" on storage.objects for select to anon
  using (bucket_id = 'photos' and public.crm_photo_publique(name));

-- Demandes envoyées depuis la vitrine : arrivent dans l'appli du garage (en direct).
create table if not exists public.crm_demandes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.crm_entreprises (id) on delete cascade,
  cree_le timestamptz not null default now(),
  nom text not null,
  telephone text not null default '',
  email text not null default '',
  message text not null default '',
  vehicule_id text not null default '',
  vehicule text not null default '',
  traite boolean not null default false
);
alter table public.crm_demandes enable row level security;
drop policy if exists "Demandes : équipe" on public.crm_demandes;
create policy "Demandes : équipe" on public.crm_demandes for all to authenticated
  using (entreprise_id = public.crm_entreprise()) with check (entreprise_id = public.crm_entreprise());

create or replace function public.crm_vitrine_demande(p_slug text, p_nom text, p_tel text, p_email text, p_message text, p_vid text, p_vehicule text)
returns boolean language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  select entreprise_id into eid from public.crm_vitrine where slug = lower(trim(p_slug)) and actif;
  if eid is null then raise exception 'Vitrine introuvable'; end if;
  if length(trim(coalesce(p_nom, ''))) not between 1 and 80 or length(coalesce(p_tel, '')) > 30 or length(coalesce(p_email, '')) > 120
     or length(coalesce(p_message, '')) > 1000 or (trim(coalesce(p_tel, '')) = '' and trim(coalesce(p_email, '')) = '') then
    raise exception 'Demande incomplète';
  end if;
  -- Garde-fou contre les envois en rafale.
  if (select count(*) from public.crm_demandes where entreprise_id = eid and cree_le > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de demandes, réessayez plus tard';
  end if;
  insert into public.crm_demandes (entreprise_id, nom, telephone, email, message, vehicule_id, vehicule)
  values (eid, trim(p_nom), trim(coalesce(p_tel, '')), trim(coalesce(p_email, '')), trim(coalesce(p_message, '')), coalesce(p_vid, ''), left(coalesce(p_vehicule, ''), 160));
  return true;
end $$;
grant execute on function public.crm_vitrine_demande(text, text, text, text, text, text, text) to anon, authenticated;
revoke execute on function public.crm_vitrine_publier(text, boolean, jsonb, text[]) from public, anon;
grant execute on function public.crm_vitrine_publier(text, boolean, jsonb, text[]) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.crm_demandes;
exception when duplicate_object then null; end $$;
