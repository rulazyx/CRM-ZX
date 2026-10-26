-- À coller une seule fois dans Supabase > SQL Editor > New query, puis « Run ».
-- Crée la table qui garde les données du CRM, une ligne par compte, visible uniquement par son propriétaire.

create table if not exists public.crm_data (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data jsonb not null default '{}'::jsonb,
  updated_at text not null
);

alter table public.crm_data enable row level security;

drop policy if exists "Chacun ses données" on public.crm_data;
create policy "Chacun ses données" on public.crm_data
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
