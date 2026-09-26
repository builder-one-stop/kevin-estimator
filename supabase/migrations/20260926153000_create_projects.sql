-- TODO(auth): Replace these temporary anon policies with user/workspace scoped policies before production.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  address text,
  stage text not null default 'Lead',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint projects_stage_check check (stage in (
    'Lead', 'Draft', 'Bidding', 'Approved', 'In progress', 'Completed'
  ))
);

create index projects_client_id_idx on public.projects(client_id);

alter table public.projects enable row level security;
grant select, insert, update, delete on public.projects to anon;

create policy "Temporary anon read projects"
  on public.projects for select to anon using (true);
create policy "Temporary anon create projects"
  on public.projects for insert to anon with check (true);
create policy "Temporary anon update projects"
  on public.projects for update to anon using (true) with check (true);
create policy "Temporary anon delete projects"
  on public.projects for delete to anon using (true);

-- The existing trigger function only updates NEW.updated_at and works for both tables.
create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_clients_updated_at();
