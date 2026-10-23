import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {validateEnrollment,renderProductionMigration} from '../../server/releaseEnrollment.js'
import {localDatabase} from './localRepository.js'
const admin='85774372-1860-4b0d-af62-a912982694cd',operator='3c444217-9936-4f09-a85b-1f541b7359fc'
const manifest=()=>({schemaVersion:1,projectRef:'vtpciccluvpaclbeqxih',organization:{id:randomUUID(),name:"SYNTHETIC One Stop ' $enrollment$; -- \\"},accounts:[{id:admin,role:'admin',email:'synthetic-admin@example.invalid',name:"Synthetic ' admin $$"},{id:operator,role:'operator',email:'synthetic-operator@example.invalid',name:'Synthetic operator'}],historicalProjects:[]})
const draft=()=>readFileSync('supabase/migrations/20261023180600_one_stop_sales_commercial_hybrid_costs.sql','utf8')
async function setup(m){const db=await localDatabase();await db.query('delete from beta_accounts');for(const a of m.accounts){await db.query('insert into auth.users(id,email) values($1,$2)',[a.id,a.email]);await db.query('insert into beta_accounts(user_id,role) values($1,$2)',[a.id,a.role])}return db}
it('rejects unknown identities, wrong project, duplicate historical leads, secrets and incomplete templates before generating SQL',()=>{
 expect(()=>validateEnrollment(JSON.parse(readFileSync('docs/release-enrollment.example.json','utf8')))).toThrow()
 const m=manifest();expect(validateEnrollment(m).accounts).toHaveLength(2)
 expect(()=>validateEnrollment({...m,projectRef:'ovynptxpeieypobhvvfz'})).toThrow()
 expect(()=>validateEnrollment({...m,OPENAI_API_KEY:'synthetic'})).toThrow()
 expect(()=>validateEnrollment({...m,accounts:[{...m.accounts[0],id:randomUUID()},m.accounts[1]]})).toThrow('ENROLLMENT_IDENTITIES_MISMATCH')
 const p={id:randomUUID(),ownerId:operator};expect(()=>validateEnrollment({...m,historicalProjects:[p,p]})).toThrow('ENROLLMENT_PROJECT_MAP_INVALID')
 expect(()=>validateEnrollment({...m,historicalProjects:[{id:randomUUID(),ownerId:randomUUID()}]})).toThrow('ENROLLMENT_PROJECT_MAP_INVALID')
})
it('enrolls verified accounts and explicitly inventoried historical leads in one transaction without changing owners or creating accounts',async()=>{
 const m=manifest(),id=randomUUID(),db=await setup(m)
 try{
 await db.query("insert into projects(id,owner_id,name) values($1,$2,'SYNTHETIC historical lead')",[id,operator]);m.historicalProjects=[{id,ownerId:operator}]
 const before=(await db.query('select id,email from auth.users order by id')).rows
 await db.exec(renderProductionMigration(draft(),m))
 expect((await db.query('select id,email from auth.users order by id')).rows).toEqual(before)
 expect((await db.query('select owner_id,name from projects where id=$1',[id])).rows[0]).toEqual({owner_id:operator,name:'SYNTHETIC historical lead'})
 expect((await db.query('select organization_id,assigned_to from sales_project_access where project_id=$1',[id])).rows[0]).toEqual({organization_id:m.organization.id,assigned_to:null})
 expect((await db.query('select role,active from sales_memberships')).rows).toEqual([{role:'manager',active:true},{role:'manager',active:true}])
 expect((await db.query('select name from sales_organizations')).rows[0].name).toBe(m.organization.name)
 }finally{await db.close()}
},30000)
it('fails before schema expansion if identity or historical inventory changes, and rolls back enrollment with the schema',async()=>{
 const m=manifest(),db=await setup(m)
 try{
 const changed=structuredClone(m);changed.accounts[0].email='wrong@example.invalid'
 await expect(db.exec(renderProductionMigration(draft(),changed))).rejects.toThrow('ENROLLMENT_IDENTITY_RECHECK_FAILED');await db.exec('rollback')
 expect((await db.query("select to_regclass('public.sales_memberships') as t")).rows[0].t).toBeNull()
 const id=randomUUID();await db.query("insert into projects(id,owner_id,name) values($1,$2,'SYNTHETIC unreviewed lead')",[id,operator])
 await expect(db.exec(renderProductionMigration(draft(),m))).rejects.toThrow('ENROLLMENT_PROJECT_INVENTORY_CHANGED');await db.exec('rollback')
 m.historicalProjects=[{id,ownerId:operator}]
 const sql=renderProductionMigration(draft(),m).replace(/^commit;\s*$/m,()=>"do $$begin raise exception 'SYNTHETIC_POST_ENROLLMENT_FAILURE';end $$;\ncommit;")
 await expect(db.exec(sql)).rejects.toThrow('SYNTHETIC_POST_ENROLLMENT_FAILURE');await db.exec('rollback')
 expect((await db.query("select to_regclass('public.sales_memberships') as t")).rows[0].t).toBeNull()
 expect((await db.query('select owner_id from projects where id=$1',[id])).rows[0].owner_id).toBe(operator)
 }finally{await db.close()}
},30000)
