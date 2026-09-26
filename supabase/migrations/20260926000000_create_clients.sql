-- TODO(auth): These anon policies are for the unauthenticated development phase only.
-- Replace them with user or organization scoped policies before production.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clients enable row level security;

grant select, insert, update, delete on public.clients to anon;

create policy "Temporary anon read clients"
  on public.clients for select to anon using (true);
create policy "Temporary anon create clients"
  on public.clients for insert to anon with check (true);
create policy "Temporary anon update clients"
  on public.clients for update to anon using (true) with check (true);
create policy "Temporary anon delete clients"
  on public.clients for delete to anon using (true);

create or replace function public.set_clients_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_clients_updated_at
  before update on public.clients
  for each row execute function public.set_clients_updated_at();
