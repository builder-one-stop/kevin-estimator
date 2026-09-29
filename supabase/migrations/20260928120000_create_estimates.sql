-- Estimate data is available only to a signed-in owner. Existing anon grants are unchanged.
create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default 'Untitled estimate',
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Accepted', 'Rejected')),
  markup_bps integer not null default 3600 check (markup_bps between 0 and 100000),
  document jsonb not null default '{"sections":[],"proposal":{"intro":"","scope":"","notes":"","exclusions":"","terms":""}}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_document_shape check (jsonb_typeof(document) = 'object' and jsonb_typeof(document->'sections') = 'array' and jsonb_typeof(document->'proposal') = 'object')
);
create index estimates_owner_updated_idx on public.estimates(owner_id, updated_at desc);
create index estimates_project_idx on public.estimates(project_id);
create index estimates_client_idx on public.estimates(client_id);

create function public.touch_estimate() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;
create trigger touch_estimate before update on public.estimates for each row execute function public.touch_estimate();

alter table public.estimates enable row level security;
grant select, insert, update, delete on public.estimates to authenticated;
create policy "Owners read estimates" on public.estimates for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners create estimates" on public.estimates for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners update estimates" on public.estimates for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete estimates" on public.estimates for delete to authenticated using (owner_id = (select auth.uid()));

create table public.estimate_messages (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  operations jsonb,
  created_at timestamptz not null default now()
);
create index estimate_messages_order_idx on public.estimate_messages(estimate_id, created_at);
alter table public.estimate_messages enable row level security;
grant select, insert, delete on public.estimate_messages to authenticated;
create policy "Owners read estimate messages" on public.estimate_messages for select to authenticated
  using (exists (select 1 from public.estimates where id = estimate_id and owner_id = (select auth.uid())));
create policy "Owners create estimate messages" on public.estimate_messages for insert to authenticated
  with check (exists (select 1 from public.estimates where id = estimate_id and owner_id = (select auth.uid())));
create policy "Owners delete estimate messages" on public.estimate_messages for delete to authenticated
  using (exists (select 1 from public.estimates where id = estimate_id and owner_id = (select auth.uid())));

-- The existing app still uses clients and projects while the user is signed in.
-- This adds authenticated access; it does not change the existing anon grants.
grant select, insert, update, delete on public.clients, public.projects to authenticated;
create policy "Authenticated read clients" on public.clients for select to authenticated using ((select auth.uid()) is not null);
create policy "Authenticated create clients" on public.clients for insert to authenticated with check ((select auth.uid()) is not null);
create policy "Authenticated update clients" on public.clients for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "Authenticated delete clients" on public.clients for delete to authenticated using ((select auth.uid()) is not null);
create policy "Authenticated read projects" on public.projects for select to authenticated using ((select auth.uid()) is not null);
create policy "Authenticated create projects" on public.projects for insert to authenticated with check ((select auth.uid()) is not null);
create policy "Authenticated update projects" on public.projects for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "Authenticated delete projects" on public.projects for delete to authenticated using ((select auth.uid()) is not null);
