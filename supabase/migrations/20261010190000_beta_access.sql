begin;

-- Account grants are separate from data ownership. No existing owner or record changes.
create table public.beta_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null unique check (role in ('operator', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.beta_accounts enable row level security;
revoke all on public.beta_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.beta_accounts to service_role;

create function public.beta_register_accounts() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if exists (select lower(email) from auth.users
    where lower(email) in ('homecolor45@gmail.com', 'builderonestop44@gmail.com')
    group by lower(email) having count(*) > 1) then
    raise exception 'Duplicate authorized identity; reconcile before activation';
  end if;
  insert into public.beta_accounts(user_id, role)
    select id, case lower(email) when 'homecolor45@gmail.com' then 'operator' else 'admin' end
    from auth.users where lower(email) in ('homecolor45@gmail.com', 'builderonestop44@gmail.com')
    on conflict (user_id) do nothing;
end $$;
revoke all on function public.beta_register_accounts() from public, anon, authenticated;
grant execute on function public.beta_register_accounts() to service_role;
select public.beta_register_accounts();

create function public.beta_account_role() returns text
language sql stable security definer set search_path = public, auth as $$
  select role from public.beta_accounts where user_id = auth.uid()
    and exists (select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) amr
      where amr->>'method' = 'password')
$$;
revoke all on function public.beta_account_role() from public, anon;
grant execute on function public.beta_account_role() to authenticated;

create function public.beta_session_access() returns jsonb
language sql stable security invoker set search_path = public, auth as $$
  select jsonb_build_object('role', public.beta_account_role(), 'userId', auth.uid())
$$;
revoke all on function public.beta_session_access() from public, anon;
grant execute on function public.beta_session_access() to authenticated;

do $$ declare t text; begin
  foreach t in array array['clients','projects','estimates','estimate_messages',
    'ai_conversations','ai_settings','ai_attachments','estimate_revisions'] loop
    execute format('create policy beta_authorized_only on public.%I as restrictive for all to authenticated using ((select public.beta_account_role()) is not null) with check ((select public.beta_account_role()) is not null)', t);
  end loop;
end $$;

-- Keep normal RLS owner-only. Administrative review is a separate read-only RPC
-- available only to the application server, which passes its verified actor ID.
create function public.beta_review(p_actor uuid, p_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare subject uuid; c public.ai_conversations; e jsonb; r jsonb;
begin
  if not exists (select 1 from public.beta_accounts where user_id=p_actor and role='admin') then
    raise exception 'BETA_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select user_id into subject from public.beta_accounts where role='operator';
  if subject is null then raise exception 'BETA_OPERATOR_UNAVAILABLE'; end if;
  if p_id is null then
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id,title,estimate_id,created_at,updated_at from public.ai_conversations
      where owner_id=subject order by updated_at desc limit 100
    ) x), '[]'::jsonb);
  end if;
  select * into c from public.ai_conversations where id=p_id and owner_id=subject;
  if c.id is null then return null; end if;
  select to_jsonb(x) into e from public.estimates x where id=c.estimate_id and owner_id=subject;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.version desc),'[]'::jsonb) into r
    from (select * from public.estimate_revisions where estimate_id=c.estimate_id and owner_id=subject
      order by version desc limit 50) x;
  return jsonb_build_object('conversation',to_jsonb(c),'estimate',e,'revisions',r);
end $$;
revoke all on function public.beta_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.beta_review(uuid,uuid) to service_role;

-- Auth uses the same database role for public and admin password updates.
-- Guard every direct Auth update; use a service-only administrative hash setter.
-- Plaintext passwords never reach SQL. The local admin tool computes bcrypt.
create function public.beta_guard_password() returns trigger
language plpgsql set search_path=public,auth as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
    and (current_user <> 'postgres' or current_setting('app.beta_password_admin',true) is distinct from 'enabled') then
    raise exception 'BETA_PASSWORD_ADMIN_ONLY' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.beta_guard_password() from public,anon,authenticated;
create trigger beta_password_admin_only before update of encrypted_password on auth.users
  for each row execute function public.beta_guard_password();

create function public.beta_admin_set_password(p_user uuid,p_hash text) returns void
language plpgsql security definer set search_path=public,auth as $$
begin
  if not exists(select 1 from public.beta_accounts where user_id=p_user) then
    raise exception 'BETA_ACCOUNT_REQUIRED' using errcode='42501';
  end if;
  if p_hash !~ '^\$2[aby]\$10\$[./A-Za-z0-9]{53}$' then raise exception 'BETA_INVALID_PASSWORD_HASH'; end if;
  perform set_config('app.beta_password_admin','enabled',true);
  update auth.users set encrypted_password=p_hash,updated_at=now(),
    confirmation_token='',confirmation_sent_at=null,recovery_token='',recovery_sent_at=null,
    email_change_token_current='',email_change_token_new='',email_change_sent_at=null,
    phone_change_token='',phone_change_sent_at=null,reauthentication_token='',reauthentication_sent_at=null
    where id=p_user;
  perform set_config('app.beta_password_admin','',true);
  delete from auth.one_time_tokens where user_id=p_user;
  delete from auth.refresh_tokens where user_id::text=p_user::text;
  delete from auth.sessions where user_id=p_user;
end $$;
revoke all on function public.beta_admin_set_password(uuid,text) from public,anon,authenticated;
grant execute on function public.beta_admin_set_password(uuid,text) to service_role;

commit;
