import { describe,it,expect,beforeAll,afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { documentFromLines } from '../../shared/aiDomain.js'
import { directEstimateChange } from '../../shared/estimateCommands.js'
import { isPdfRequest,estimatePresentation } from '../../shared/estimatePresentation.js'
import { estimatePublicMessage } from '../../server/publicText.js'
import { normalizeSignature } from '../../server/signature.js'
import { fixturePlan,fixtureLines } from './fixture.js'
import { localDatabase,A,B } from './localRepository.js'
const estimate=()=>({id:randomUUID(),version:1,title:'Bridge validation',status:'Draft',markup_bps:3600,created_at:new Date().toISOString(),document:documentFromLines(fixturePlan,fixtureLines,'en')})
describe('precise reviewed message edits',()=>{
 it('keeps manual materials, notes and terms while reducing labor exactly 5.5%',()=>{
  const e=estimate();e.document.sections[0].items[0].quantity=7;e.document.sections[0].items[0].notes='Keep this manual note';e.document.proposal.terms='Manual terms';
  const before=structuredClone(e),r=directEstimateChange(e,'Mantén los materiales y baja la mano de obra un 5.5 %',3,'es')
  expect(e).toEqual(before);expect(r.pending.estimateVersion).toBe(1);expect(r.pending.operations).toHaveLength(7)
  expect(r.pending.document.sections[0].items[3].unitCost).toBe(70.88)
  expect(r.pending.document.sections[0].items[0]).toEqual(e.document.sections[0].items[0]);expect(r.pending.document.proposal).toEqual(e.document.proposal)
 })
 it('clarifies ambiguous paint selection; exact room/item changes preserve other lines',()=>{
  const e=estimate();expect(directEstimateChange(e,'Cambia la pintura a tres galones',2,'es').pending).toBeUndefined()
  const r=directEstimateChange(e,'Change Bedroom 1 Walls to 3.5 gallons',2)
  expect(r.pending.operations).toHaveLength(1);expect(r.pending.document.sections[0].items[0].quantity).toBe(3.5)
  expect(r.pending.document.sections.slice(1)).toEqual(e.document.sections.slice(1))
 })
 it('recognizes only explicit standalone PDF actions',()=>{
  for(const s of ['Descargar PDF','Pasar a PDF','Export as PDF','Please download PDF.'])expect(isPdfRequest(s)).toBe(true)
  for(const s of ['Change paint and download PDF','No descargar PDF','PDF links?'])expect(isPdfRequest(s)).toBe(false)
 })
 it('replaces invented model PDF claims and links with the explicit system action',()=>{
  for(const text of ['Your PDF is ready: https://fake.invalid/estimate.pdf','Ya generé el PDF: sandbox:/mnt/data/falso.pdf']){const result=estimatePublicMessage(text,'es');expect(result).not.toContain('fake.invalid');expect(result).not.toContain('sandbox:');expect(result).toContain('Descargar PDF')}
  expect(estimatePublicMessage('Which room?')).toBe('Which room?')
 })
 it('uses the same allocated total, metadata and line IDs in document and PDF presentation',()=>{
  const e=estimate(),v=estimatePresentation(e);expect(v.sections.flatMap(s=>s.items).reduce((n,i)=>n+i.amount,0)).toBe(v.sums.priceCents);expect(v.sums.priceCents).toBe(400860)
 })
 it('accepts only small raster signature assets and re-encodes them',async()=>{
  const bytes=await sharp({create:{width:10,height:10,channels:4,background:'#ffffff00'}}).png().toBuffer()
  expect(await normalizeSignature('data:image/png;base64,'+bytes.toString('base64'))).toMatch(/^data:image\/png;base64,/)
  for(const s of ['https://untrusted.invalid/signature.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YmFk'])await expect(normalizeSignature(s)).rejects.toMatchObject({code:'INVALID_SIGNATURE'})
 })
})
let db
beforeAll(async()=>{db=await localDatabase()},30000)
afterAll(async()=>{await db?.close()})
async function as(id,fn){return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await tx.exec('set local role authenticated');return fn(tx)})}
describe('finalization in real migrated PostgreSQL',()=>{
 it('finalizes the same row/revision once, retains customer status, and edits invalidate finalization',async()=>{
  const e=estimate();await db.query('insert into estimates(id,owner_id,title,document,markup_bps) values($1,$2,$3,$4,$5)',[e.id,A,e.title,JSON.stringify(e.document),e.markup_bps]);const request=randomUUID()
  const finalize=(id,version,key=request)=>as(id,async tx=>(await tx.query('select to_jsonb(finalize_estimate($1,$2,$3)) as value',[e.id,version,key])).rows[0].value)
  const first=await finalize(A,1);expect(first.id).toBe(e.id);expect(first.version).toBe(2);expect(first.finalized_version).toBe(2);expect(first.status).toBe('Draft')
  expect(await finalize(A,1)).toEqual(first);expect(await finalize(A,2,randomUUID())).toEqual(first)
  await expect(finalize(B,2)).rejects.toMatchObject({code:'42501'})
  await as(A,tx=>tx.query('update estimates set title=$1 where id=$2',['Manual change',e.id]))
  const edited=(await db.query('select * from estimates where id=$1',[e.id])).rows[0];expect(edited.version).toBe(3);expect(edited.finalized_at).toBeNull()
  await expect(finalize(A,2,randomUUID())).rejects.toThrow('ESTIMATE_CONFLICT')
  expect((await db.query('select count(*)::int as n from estimates where id=$1',[e.id])).rows[0].n).toBe(1)
 })
 it('denies workers access to finalization, documents and stored signature settings',async()=>{
  const worker=randomUUID();await db.query('insert into auth.users(id) values($1)',[worker]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[worker]);await db.query("insert into workers(id,user_id,manager_id,email,name) values($1,$1,$2,'worker@test.invalid','Worker')",[worker,A])
  await expect(as(worker,tx=>tx.query('select finalize_estimate($1,1,$2)',[randomUUID(),randomUUID()]))).rejects.toMatchObject({code:'42501'})
  for(const table of ['estimates','estimate_revisions','ai_settings'])expect(await as(worker,async tx=>(await tx.query(`select * from ${table}`)).rows)).toEqual([])
 })
})
