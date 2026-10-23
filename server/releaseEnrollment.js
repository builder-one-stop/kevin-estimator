import {z} from 'zod'
const accounts={admin:'85774372-1860-4b0d-af62-a912982694cd',operator:'3c444217-9936-4f09-a85b-1f541b7359fc'}
const member=z.object({id:z.string().uuid(),role:z.enum(['admin','operator']),email:z.email().max(254),name:z.string().trim().min(1).max(120)}).strict()
const schema=z.object({schemaVersion:z.literal(1),projectRef:z.literal('vtpciccluvpaclbeqxih'),organization:z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(120)}).strict(),accounts:z.array(member).length(2),historicalProjects:z.array(z.object({id:z.string().uuid(),ownerId:z.string().uuid()}).strict()).max(5000)}).strict()
export function validateEnrollment(input){
 const manifest=schema.parse(input)
 if(new Set(manifest.accounts.map(x=>x.role)).size!==2||manifest.accounts.some(x=>accounts[x.role]!==x.id)||new Set(manifest.accounts.map(x=>x.email.toLowerCase())).size!==2)throw Error('ENROLLMENT_IDENTITIES_MISMATCH')
 if(new Set(manifest.historicalProjects.map(x=>x.id)).size!==manifest.historicalProjects.length||manifest.historicalProjects.some(x=>!Object.values(accounts).includes(x.ownerId)))throw Error('ENROLLMENT_PROJECT_MAP_INVALID')
 return manifest
}
export function renderProductionMigration(sql,input){
 const manifest=validateEnrollment(input)
 if(!/^begin;\s*$/m.test(sql)||!/^commit;\s*$/m.test(sql)||[...sql.matchAll(/^begin;\s*$/gm)].length!==1||[...sql.matchAll(/^commit;\s*$/gm)].length!==1)throw Error('ENROLLMENT_TRANSACTION_INVALID')
 // JSON is data inside a single escaped SQL literal; it cannot become executable SQL.
 const data="'"+JSON.stringify(manifest).replaceAll("'","''")+"'"
 const preflight=`
lock table public.projects in share row exclusive mode;
set local standard_conforming_strings=on;
set local app.one_stop_enrollment=${data};
do $enrollment$
declare config jsonb:=current_setting('app.one_stop_enrollment')::jsonb;person jsonb;project jsonb;expected integer;actual integer;
begin
 for person in select value from jsonb_array_elements(config->'accounts') loop
  perform b.user_id from public.beta_accounts b join auth.users u on u.id=b.user_id where b.user_id=(person->>'id')::uuid and b.role=person->>'role' and lower(u.email)=lower(person->>'email') for share of b,u;
  if not found then raise exception 'ENROLLMENT_IDENTITY_RECHECK_FAILED';end if;
  select count(*) into expected from jsonb_array_elements(config->'historicalProjects') p where p->>'ownerId'=person->>'id';
  select count(*) into actual from public.projects where owner_id=(person->>'id')::uuid;
  if actual<>expected then raise exception 'ENROLLMENT_PROJECT_INVENTORY_CHANGED';end if;
 end loop;
 for project in select value from jsonb_array_elements(config->'historicalProjects') loop
  if not exists(select 1 from public.projects where id=(project->>'id')::uuid and owner_id=(project->>'ownerId')::uuid) then raise exception 'ENROLLMENT_PROJECT_OWNER_MISMATCH';end if;
 end loop;
end $enrollment$;
`
 const enrollment=`
-- Explicit organization enrollment; no Auth users, role conversions or owner updates.
do $enrollment$
declare config jsonb:=current_setting('app.one_stop_enrollment')::jsonb;person jsonb;project jsonb;org uuid;
begin
 org:=(config->'organization'->>'id')::uuid;
 insert into public.sales_organizations(id,name) values(org,config->'organization'->>'name');
 for person in select value from jsonb_array_elements(config->'accounts') loop
  insert into public.sales_memberships(user_id,organization_id,name,role,active) values((person->>'id')::uuid,org,person->>'name','manager',true);
 end loop;
 for project in select value from jsonb_array_elements(config->'historicalProjects') loop
  insert into public.sales_project_access(project_id,organization_id,assigned_to) values((project->>'id')::uuid,org,null);
 end loop;
 if (select count(*) from public.sales_memberships where organization_id=org and active and role='manager')<>2 then raise exception 'ENROLLMENT_POSTCHECK_FAILED';end if;
 if exists(select 1 from jsonb_array_elements(config->'historicalProjects') x left join public.projects p on p.id=(x->>'id')::uuid left join public.sales_project_access a on a.project_id=p.id where p.owner_id is distinct from (x->>'ownerId')::uuid or a.organization_id is distinct from org or a.assigned_to is not null) then raise exception 'ENROLLMENT_POSTCHECK_FAILED';end if;
end $enrollment$;
`
 return sql.replace(/^begin;\s*$/m,()=> 'begin;\n'+preflight).replace(/^commit;\s*$/m,()=>enrollment+'\ncommit;')
}
