-- LOCAL PGLITE ONLY. Historical filename retained; never run against a remote project.
-- Reuses pre-enrolled reserved fixture identities. No Auth/account/member writes.
-- All client/project/estimate/message test records are rolled back.
begin;
do $local_fixture$
begin
 if current_setting('app.one_stop_local_isolation',true) is distinct from 'enabled' then raise exception 'LOCAL_ISOLATION_FIXTURE_REQUIRED';end if;
 if (select count(*) from public.beta_accounts)<>2 or
  not exists(select 1 from auth.users u join public.beta_accounts b on b.user_id=u.id join public.sales_memberships m on m.user_id=u.id where u.id='10000000-0000-4000-8000-000000000001' and u.email='isolation-a@example.invalid' and b.role='operator' and m.active and m.role='manager' and m.name='Isolation fixture A') or
  not exists(select 1 from auth.users u join public.beta_accounts b on b.user_id=u.id join public.sales_memberships m on m.user_id=u.id where u.id='10000000-0000-4000-8000-000000000002' and u.email='isolation-b@example.invalid' and b.role='admin' and m.active and m.role='manager' and m.name='Isolation fixture B') then raise exception 'LOCAL_ISOLATION_IDENTITIES_REQUIRED';end if;
end $local_fixture$;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege or check_violation or foreign_key_violation then return;
  end;
  raise exception 'Expected rejection: %', statement;
end $$;
set local request.jwt.claims = '{"amr":[{"method":"password"}]}';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"password"}]}';
insert into public.clients(id,name) values ('91000000-0000-4000-8000-000000000001','Isolation fixture A');
insert into public.projects(id,name,client_id) values ('92000000-0000-4000-8000-000000000001','Isolation fixture A','91000000-0000-4000-8000-000000000001');
insert into public.estimates(id,title,client_id,project_id) values ('93000000-0000-4000-8000-000000000001','Isolation fixture A','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001');
insert into public.estimate_messages(estimate_id,role,content) values ('93000000-0000-4000-8000-000000000001','user','Isolation fixture');
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","session_id":"10000000-0000-4000-8000-000000000002","amr":[{"method":"password"}]}';
insert into public.clients(id,name) values ('91000000-0000-4000-8000-000000000002','Isolation fixture B');
insert into public.projects(id,name,client_id) values ('92000000-0000-4000-8000-000000000002','Isolation fixture B','91000000-0000-4000-8000-000000000002');
insert into public.estimates(id,title,client_id,project_id) values ('93000000-0000-4000-8000-000000000002','Isolation fixture B','91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select count(*)=1 from public.clients where id in ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')), 'client isolation');
select pg_temp.assert_true((select count(*)=1 from public.projects where id in ('92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002')), 'project isolation');
select pg_temp.assert_true((select count(*)=1 from public.estimates where id in ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002')), 'estimate isolation');
select pg_temp.assert_true((select count(*)=0 from public.estimate_messages where estimate_id in ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002')), 'message isolation');
with changed as (update public.clients set name='Forbidden' where id='91000000-0000-4000-8000-000000000001' returning id) select pg_temp.assert_true((select count(*)=0 from changed),'foreign update');
with changed as (delete from public.projects where id='92000000-0000-4000-8000-000000000001' returning id) select pg_temp.assert_true((select count(*)=0 from changed),'foreign delete');
select pg_temp.denied($q$insert into public.clients(name,owner_id) values ('Forged','10000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied($q$insert into public.projects(name,client_id) values ('Forged','91000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied($q$update public.estimates set client_id='91000000-0000-4000-8000-000000000001' where id='93000000-0000-4000-8000-000000000002'$q$);
select pg_temp.denied($q$insert into public.estimates(project_id) values ('92000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied($q$insert into public.estimates(project_id) values ('92000000-0000-4000-8000-000000000002')$q$);
select pg_temp.denied($q$insert into public.estimate_messages(estimate_id,role,content) values ('93000000-0000-4000-8000-000000000001','user','Forbidden')$q$);
select pg_temp.denied($q$insert into public.estimate_messages(estimate_id,role,content) values ('93000000-0000-4000-8000-000000000002','assistant','Forbidden')$q$);
update public.estimates set title='Saved' where id='93000000-0000-4000-8000-000000000002' and version=1;
select pg_temp.assert_true((select version=2 and title='Saved' from public.estimates where id='93000000-0000-4000-8000-000000000002'),'save and version');
with changed as (update public.estimates set title='Stale' where id='93000000-0000-4000-8000-000000000002' and version=1 returning id) select pg_temp.assert_true((select count(*)=0 from changed),'stale write');
set local role anon;
set local request.jwt.claim.sub = '';
do $$ declare tab text; begin
  foreach tab in array array['clients','projects','estimates','estimate_messages'] loop
    perform pg_temp.denied(format('select * from public.%I',tab));
    perform pg_temp.denied(format('insert into public.%I default values',tab));
    perform pg_temp.denied(format('update public.%I set id=id',tab));
    perform pg_temp.denied(format('delete from public.%I',tab));
  end loop;
end $$;
rollback;
select 'PASS: isolation, relationships, versions, anonymous CRUD; fixtures rolled back' as result;
