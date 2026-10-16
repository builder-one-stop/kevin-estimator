export const bootstrap = `create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema storage to anon,authenticated,service_role; grant select,insert,update,delete on storage.objects to anon,authenticated,service_role; create schema auth; create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb default '{}'::jsonb,
 updated_at timestamptz,confirmation_token text,confirmation_sent_at timestamptz,recovery_token text,recovery_sent_at timestamptz,
 email_change_token_current text,email_change_token_new text,email_change_sent_at timestamptz,
 phone_change_token text,phone_change_sent_at timestamptz,reauthentication_token text,reauthentication_sent_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.refresh_tokens(user_id text);create table auth.one_time_tokens(user_id uuid);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',auth.uid()) || coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;`
