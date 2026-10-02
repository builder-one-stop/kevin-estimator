begin;
-- Verified remote tables were empty on 2026-10-02. Refuse to infer ownership
-- if legacy data appears before application. Transaction locks prevent a race.
lock table public.clients, public.projects, public.estimates in access exclusive mode;
do $$ begin
  if exists (select 1 from public.clients) or exists (select 1 from public.projects) then
    raise exception 'Legacy client/project ownership requires explicit reconciliation; no changes applied';
  end if;
end $$;
alter table public.clients add column owner_id uuid not null references auth.users(id);
alter table public.projects add column owner_id uuid not null references auth.users(id);
alter table public.clients alter column owner_id set default auth.uid();
alter table public.projects alter column owner_id set default auth.uid();

-- Remove every existing permissive policy, including the temporary anonymous ones.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('clients', 'projects')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
revoke all on public.clients, public.projects, public.estimates, public.estimate_messages from anon;
grant select, insert, update, delete on public.clients, public.projects to authenticated;
create policy "Owners manage clients" on public.clients to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners manage projects" on public.projects to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create index clients_owner_idx on public.clients(owner_id);
create index projects_owner_idx on public.projects(owner_id);
alter table public.clients add constraint clients_id_owner_key unique (id, owner_id);
alter table public.projects add constraint projects_id_owner_key unique (id, owner_id);

-- Composite keys also enforce ownership for writes outside RLS and parent changes.
-- All constraints are validated; no legacy links are silently exempted.
alter table public.projects add constraint projects_client_owner_fkey
  foreign key (client_id, owner_id) references public.clients(id, owner_id)
  on delete set null (client_id);
alter table public.estimates add constraint estimates_client_owner_fkey
  foreign key (client_id, owner_id) references public.clients(id, owner_id)
  on delete set null (client_id);
alter table public.estimates add constraint estimates_project_owner_fkey
  foreign key (project_id, owner_id) references public.projects(id, owner_id)
  on delete set null (project_id);

-- Recheck links on every estimate write, including edits to old records whose
-- links could predate the ownership constraints. An invisible project is invalid.
create or replace function public.validate_estimate_project_client() returns trigger
language plpgsql set search_path = public as $$
declare project_client uuid;
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients where id = new.client_id and owner_id = new.owner_id
  ) then
    raise exception 'Unauthorized estimate client' using errcode = '23514';
  end if;
  if new.project_id is not null then
    select client_id into project_client from public.projects
      where id = new.project_id and owner_id = new.owner_id for share;
    if not found then
      raise exception 'Unauthorized estimate project' using errcode = '23514';
    end if;
    if project_client is not null and new.client_id is distinct from project_client then
      raise exception 'Estimate client must match project client' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger validate_estimate_project_client on public.estimates;
create trigger validate_estimate_project_client before insert or update on public.estimates
  for each row execute function public.validate_estimate_project_client();

create function public.validate_project_estimate_clients() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.client_id is not null and exists (
    select 1 from public.estimates where project_id = new.id and client_id is distinct from new.client_id
  ) then
    raise exception 'Project client conflicts with linked estimates' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_project_estimate_clients before update of client_id on public.projects
  for each row execute function public.validate_project_estimate_clients();

commit;
