begin;
-- A signed access token must also belong to an active Auth session. This closes
-- access immediately after sign-out/revocation, rather than waiting for JWT expiry.
create or replace function public.beta_account_role() returns text
language sql stable security definer set search_path=public,auth as $$
  select role from public.beta_accounts where user_id=auth.uid()
    and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) amr where amr->>'method'='password')
    and exists(select 1 from auth.sessions where id=nullif(auth.jwt()->>'session_id','')::uuid and user_id=auth.uid() and (not_after is null or not_after>now()))
$$;
create function public.beta_token_access(p_user uuid,p_session uuid) returns text
language sql stable security definer set search_path=public,auth as $$
  select role from public.beta_accounts where user_id=p_user
    and exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now()))
$$;
revoke all on function public.beta_token_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.beta_token_access(uuid,uuid) to service_role;
-- Reject empty administrative hashes as well as invalid formats.
create or replace function public.beta_admin_set_password(p_user uuid,p_hash text) returns void
language plpgsql security definer set search_path=public,auth as $$
begin
  if not exists(select 1 from public.beta_accounts where user_id=p_user) then
    raise exception 'BETA_ACCOUNT_REQUIRED' using errcode='42501';
  end if;
  if p_hash is null or p_hash !~ '^\$2[aby]\$10\$[./A-Za-z0-9]{53}$' then raise exception 'BETA_INVALID_PASSWORD_HASH'; end if;
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
commit;
