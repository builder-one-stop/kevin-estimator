-- REVIEW DRAFT. Apply after sales/commercial, before enabling production capabilities.
begin;
grant usage on schema sales_private to service_role;
grant select(user_id,role,active) on public.sales_memberships to service_role;
create function sales_private.valid_member(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_memberships m join public.beta_accounts b on b.user_id=m.user_id where m.user_id=p_owner and m.active
  and ((b.role='seller' and m.role='seller') or (b.role in ('admin','operator') and m.role='manager')))
$$;
revoke all on function sales_private.valid_member(uuid) from public,anon,authenticated;
-- No caller-supplied owner on the browser helper.
create or replace function sales_private.active_member() returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.valid_member(auth.uid())
$$;
grant execute on function sales_private.active_member() to authenticated;
do $$declare t text;begin
 foreach t in array array['clients','projects','estimates','estimate_messages','estimate_revisions','ai_conversations','ai_settings','ai_attachments'] loop
  execute format('create policy organization_membership_required on public.%I as restrictive for all to authenticated using(sales_private.active_member()) with check(sales_private.active_member())',t);
 end loop;
end $$;

create function sales_private.guard_owned_write() returns trigger language plpgsql security definer set search_path='' as $$
declare role_name text;
begin
 select role into role_name from public.beta_accounts where user_id=new.owner_id;
 if not sales_private.valid_member(new.owner_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if role_name='seller' then
  if tg_table_name='ai_settings' then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
  if new.client_id is not null or new.project_id is not null then raise exception 'SALES_USE_SNAPSHOT_LINK' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function sales_private.guard_owned_write() from public,anon,authenticated;
create trigger sales_estimate_write before insert or update on public.estimates for each row execute function sales_private.guard_owned_write();
create trigger sales_conversation_write before insert or update on public.ai_conversations for each row execute function sales_private.guard_owned_write();
create trigger sales_settings_write before insert or update on public.ai_settings for each row execute function sales_private.guard_owned_write();
create policy seller_standalone_estimates on public.estimates as restrictive for all to authenticated
 using(public.beta_account_role()<>'seller' or (project_id is null and client_id is null)) with check(public.beta_account_role()<>'seller' or (project_id is null and client_id is null));
create policy seller_standalone_conversations on public.ai_conversations as restrictive for all to authenticated
 using(public.beta_account_role()<>'seller' or (project_id is null and client_id is null)) with check(public.beta_account_role()<>'seller' or (project_id is null and client_id is null));

create function sales_private.enroll_new_project() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.sales_memberships;
begin
 select * into m from public.sales_memberships where user_id=new.owner_id and active and role='manager';
 if found and sales_private.valid_member(new.owner_id) then
  insert into public.sales_project_access(project_id,organization_id,assigned_to) values(new.id,m.organization_id,null);
 end if;
 return new;
end $$;
revoke all on function sales_private.enroll_new_project() from public,anon,authenticated;
create trigger sales_new_project after insert on public.projects for each row execute function sales_private.enroll_new_project();

create function sales_private.server_review(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;c public.ai_conversations;e jsonb;r jsonb;
begin
 select m.organization_id into org from public.sales_memberships m join public.beta_accounts b on b.user_id=m.user_id
  where m.user_id=p_actor and m.active and m.role='manager' and b.role='admin';
 if org is null then raise exception 'BETA_ADMIN_REQUIRED' using errcode='42501';end if;
 if p_id is null then return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
  select conversation.id,conversation.title,conversation.estimate_id,conversation.created_at,conversation.updated_at,m.name as owner_name from public.ai_conversations conversation
  join public.sales_memberships m on m.user_id=conversation.owner_id where m.organization_id=org and m.active and sales_private.valid_member(m.user_id)
  order by conversation.updated_at desc limit 100) x);end if;
 select x.* into c from public.ai_conversations x join public.sales_memberships m on m.user_id=x.owner_id
  where x.id=p_id and m.organization_id=org and m.active and sales_private.valid_member(m.user_id);
 if not found then return null;end if;
 select to_jsonb(x) into e from public.estimates x where x.id=c.estimate_id and x.owner_id=c.owner_id;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.version desc),'[]') into r from (
  select * from public.estimate_revisions where estimate_id=c.estimate_id and owner_id=c.owner_id order by version desc limit 50) x;
 return jsonb_build_object('conversation',to_jsonb(c),'estimate',e,'revisions',r);
end $$;
revoke all on function sales_private.server_review(uuid,uuid) from public,anon,authenticated;
grant execute on function sales_private.server_review(uuid,uuid) to service_role;
create function public.sales_server_review(p_actor uuid,p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select sales_private.server_review(p_actor,p_id)$$;
revoke all on function public.sales_server_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sales_server_review(uuid,uuid) to service_role;
-- Remove the historical global-single-operator review shortcut, including old server callers.
create or replace function public.beta_review(p_actor uuid,p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select sales_private.server_review(p_actor,p_id)$$;
revoke all on function public.beta_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.beta_review(uuid,uuid) to service_role;
commit;
