-- Additive. No legacy ownership assignments or remote activation.
begin;
create table public.ai_conversations (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title)<=160), client_id uuid, project_id uuid, estimate_id uuid,
 version integer not null default 1, state jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,owner_id),
 foreign key(client_id,owner_id) references public.clients(id,owner_id) on delete set null (client_id),
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete set null (project_id)
);
alter table public.estimates add constraint estimates_id_owner_unique unique(id,owner_id);
alter table public.ai_conversations add foreign key(estimate_id,owner_id) references public.estimates(id,owner_id) on delete set null (estimate_id);
create index ai_conversations_owner_date on public.ai_conversations(owner_id,updated_at desc);
-- A persisted lease enforces one live model run per owner, including across Node processes.
create unique index ai_one_run_per_owner on public.ai_conversations(owner_id) where state->'run'->>'status' = 'working';
create table public.ai_settings (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 version integer not null default 1, data jsonb not null, updated_at timestamptz not null default now()
);
create table public.ai_attachments (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null, path text not null unique, mime text not null, size integer not null check(size between 1 and 5242880),
 created_at timestamptz not null default now(),
 foreign key(conversation_id,owner_id) references public.ai_conversations(id,owner_id) on delete cascade
);
-- Serialize quota checks with run claims so concurrent uploads cannot exceed the cap.
create function public.ai_attachment_quota() returns trigger language plpgsql set search_path=public as $$
declare c ai_conversations;
begin
 select * into c from ai_conversations where id=new.conversation_id and owner_id=new.owner_id for update;
 if c.id is null then raise exception 'FORBIDDEN_RELATION'; end if;
 if c.state->'run'->>'status'='working' then raise exception 'CONFLICT'; end if;
 if (select count(*) from ai_attachments where conversation_id=new.conversation_id)>=6 then raise exception 'IMAGE_LIMIT'; end if;
 return new;
end $$;
create trigger ai_attachment_quota before insert on public.ai_attachments for each row execute function public.ai_attachment_quota();
create function public.ai_attachment_deleted() returns trigger language plpgsql set search_path=public as $$
declare c ai_conversations;
begin
 select * into c from ai_conversations where id=old.conversation_id and owner_id=old.owner_id for update;
 if c.state->'run'->>'status'='working' then raise exception 'CONFLICT'; end if;
 return old;
end $$;
create trigger ai_attachment_deleted before delete on public.ai_attachments for each row execute function public.ai_attachment_deleted();
create function public.ai_attachment_changed() returns trigger language plpgsql set search_path=public as $$
begin
 update ai_conversations set version=version+1,updated_at=now(),state=state || jsonb_build_object('pending',null,
 'approvedRevision',case when estimate_id is null then null else state->'approvedRevision' end)
 where id=coalesce(new.conversation_id,old.conversation_id);
 return coalesce(new,old);
end $$;
create trigger ai_attachment_changed after insert or delete on public.ai_attachments for each row execute function public.ai_attachment_changed();
create table public.estimate_revisions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 estimate_id uuid not null, version integer not null, origin text not null, snapshot jsonb not null,
 created_at timestamptz not null default now(), unique(estimate_id,version),
 foreign key(estimate_id,owner_id) references public.estimates(id,owner_id) on delete cascade
);
create function public.capture_estimate_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into estimate_revisions(owner_id,estimate_id,version,origin,snapshot)
 values(new.owner_id,new.id,new.version,coalesce(nullif(current_setting('app.change_origin',true),''),'manual'),to_jsonb(new));
 return new;
end $$;
create trigger capture_estimate_revision after insert or update on public.estimates for each row execute function public.capture_estimate_revision();
-- Existing data is untouched; the first subsequent edit captures its pre-edit baseline as well.
create function public.capture_estimate_baseline() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into estimate_revisions(owner_id,estimate_id,version,origin,snapshot)
 values(old.owner_id,old.id,old.version,'baseline',to_jsonb(old)) on conflict(estimate_id,version) do nothing;
 return new;
end $$;
create trigger capture_estimate_baseline before update on public.estimates for each row execute function public.capture_estimate_baseline();

alter table public.ai_conversations enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_attachments enable row level security;
alter table public.estimate_revisions enable row level security;
create policy ai_conversations_read on public.ai_conversations for select to authenticated using(owner_id=auth.uid());
create policy ai_settings_read on public.ai_settings for select to authenticated using(owner_id=auth.uid());
create policy ai_attachments_read on public.ai_attachments for select to authenticated using(owner_id=auth.uid());
create policy estimate_revisions_read on public.estimate_revisions for select to authenticated using(owner_id=auth.uid());
revoke all on public.ai_conversations,public.ai_settings,public.ai_attachments,public.estimate_revisions from anon,authenticated;
grant select on public.ai_conversations,public.ai_settings,public.ai_attachments,public.estimate_revisions to authenticated;
grant all on public.ai_conversations,public.ai_settings,public.ai_attachments,public.estimate_revisions to service_role;

-- Only the authenticated application server may call this. All inputs are validated by its schemas;
-- ownership, FK relationships, optimistic versions and atomicity are enforced again here.
create function public.ai_commit(p_owner uuid,p_id uuid,p_expected integer,p_row jsonb,p_estimate jsonb default null,p_estimate_version integer default null,p_origin text default 'ai')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c ai_conversations; e estimates; linked_client uuid; eid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into c from ai_conversations where id=p_id and owner_id=p_owner for update;
 if p_expected=0 then
   if c.id is not null then raise exception 'CONFLICT'; end if;
 elsif c.id is null or c.version<>p_expected then raise exception 'CONFLICT'; end if;
 if (p_row->>'project_id') is not null then
   select client_id into linked_client from projects where id=(p_row->>'project_id')::uuid and owner_id=p_owner for share;
   if not found then raise exception 'FORBIDDEN_RELATION'; end if;
   if linked_client is distinct from (p_row->>'client_id')::uuid then raise exception 'CLIENT_PROJECT_MISMATCH'; end if;
 end if;
 eid:=coalesce(c.estimate_id,(p_row->>'estimate_id')::uuid);
 if p_estimate is not null then
   perform set_config('app.change_origin',p_origin,true);
   if p_estimate_version=0 then
     if c.estimate_id is not null then raise exception 'ESTIMATE_EXISTS'; end if;
     eid:=(p_estimate->>'id')::uuid;
     insert into estimates(id,owner_id,title,client_id,project_id,markup_bps,document)
     values(eid,p_owner,p_estimate->>'title',(p_row->>'client_id')::uuid,(p_row->>'project_id')::uuid,(p_estimate->>'markup_bps')::integer,p_estimate->'document');
   else
     update estimates set title=p_estimate->>'title',markup_bps=(p_estimate->>'markup_bps')::integer,document=p_estimate->'document'
     where id=c.estimate_id and owner_id=p_owner and version=p_estimate_version returning * into e;
     if e.id is null then raise exception 'ESTIMATE_CONFLICT'; end if;
   end if;
 end if;
 if p_expected=0 then
   insert into ai_conversations(id,owner_id,title,client_id,project_id,estimate_id,state)
   values(p_id,p_owner,p_row->>'title',(p_row->>'client_id')::uuid,(p_row->>'project_id')::uuid,eid,p_row->'state') returning * into c;
 else
   update ai_conversations set title=p_row->>'title',client_id=(p_row->>'client_id')::uuid,project_id=(p_row->>'project_id')::uuid,estimate_id=eid,
   state=p_row->'state',version=version+1,updated_at=now() where id=p_id and owner_id=p_owner returning * into c;
 end if;
 return to_jsonb(c);
end $$;
revoke all on function public.ai_commit(uuid,uuid,integer,jsonb,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.ai_commit(uuid,uuid,integer,jsonb,jsonb,integer,text) to service_role;

-- Private assets are served only by the authenticated backend after owner checks.
-- No public/anonymous storage policies, signed public URLs or user-chosen storage paths.
do $$ begin
 if to_regclass('storage.buckets') is not null then
   insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('estimate-evidence','estimate-evidence',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
   if exists(select 1 from storage.buckets where id='estimate-evidence' and public) then raise exception 'Existing evidence bucket is public; reconcile before activation'; end if;
 end if;
 if to_regclass('storage.objects') is not null then
   execute 'create policy estimate_evidence_server_only on storage.objects as restrictive for all to anon,authenticated using (bucket_id <> ''estimate-evidence'') with check (bucket_id <> ''estimate-evidence'')';
 end if;
end $$;
commit;
