import {beforeAll,afterAll,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {salesDatabase,salesRpc,asSalesUser,SALES as S} from './salesFixture.js'
import {invoiceTotals,laDateToIso,laInput,requestIdentity} from '../../shared/commercialDocuments.js'
let db,followup,invoice,source
const rpc=(who,action,data={})=>salesRpc(db,who,'ops:'+action,data)
beforeAll(async()=>{db=await salesDatabase()},60000)
afterAll(async()=>{await db?.close()})
it('creates a lead follow-up with server attribution, LA date and idempotent retry',async()=>{
 followup={id:randomUUID(),requestId:randomUUID(),version:0,projectId:S.leadA,responsibleId:S.a,title:'QA confirm dimensions',notes:'Call internally; no external message',dueAt:laDateToIso('2026-10-23T09:00'),status:'pending'}
 const first=await rpc(S.a,'followup-save',followup),again=await rpc(S.a,'followup-save',followup)
 expect(first.id).toBe(again.id);expect(first.created_by).toBe(S.a);expect(first.version).toBe(1)
 expect((await rpc(S.kevin,'followups'))).toHaveLength(1);expect((await rpc(S.a,'followups',{projectId:S.leadA}))[0].responsible_name).toBe('Seller A QA')
})
it('denies global seller agenda, foreign leads, foreign responsible and worker access',async()=>{
 await expect(rpc(S.a,'followups')).rejects.toThrow('LEAD_REQUIRED')
 await expect(rpc(S.b,'followups',{projectId:S.leadA})).rejects.toThrow('LEAD_ACCESS_DENIED')
 await expect(rpc(S.a,'followup-save',{...followup,id:randomUUID(),requestId:randomUUID(),responsibleId:S.other})).rejects.toThrow('RESPONSIBLE_DENIED')
 await expect(rpc(S.otherManager,'followups',{projectId:S.leadA})).rejects.toThrow('LEAD_ACCESS_DENIED')
 await expect(rpc(S.worker,'context')).rejects.toThrow('ACCESS_DENIED')
 await expect(asSalesUser(db,S.a,tx=>tx.query('select * from commercial_followups'))).rejects.toThrow(/permission denied/)
})
it('requires current version, rejects changed retries and preserves reassignment boundaries',async()=>{
 const saved=await rpc(S.a,'followup-save',{...followup,version:1,requestId:randomUUID(),status:'completed'})
 expect(saved.version).toBe(2)
 await expect(rpc(S.a,'followup-save',{...followup,version:1,requestId:randomUUID()})).rejects.toThrow('VERSION_CONFLICT')
 await expect(rpc(S.a,'followup-save',{...followup,title:'Different payload'})).rejects.toThrow('REQUEST_CONFLICT')
 await salesRpc(db,S.kevin,'assign',{projectId:S.leadA,sellerId:S.b,version:1})
 await expect(rpc(S.a,'followups',{projectId:S.leadA})).rejects.toThrow('LEAD_ACCESS_DENIED')
 expect((await rpc(S.b,'followups',{projectId:S.leadA}))[0].status).toBe('completed')
 await salesRpc(db,S.kevin,'assign',{projectId:S.leadA,sellerId:S.a,version:2})
})
it('creates traceable invoice from authorized source without treating missing prices or taxes as zero',async()=>{
 source=await salesRpc(db,S.a,'create-document',{id:randomUUID(),projectId:S.leadA,title:'QA source'})
 const document={sections:[{id:'s',title:'Work',items:[{id:'a',description:'Known work',unit:'ea',quantity:2,unitCost:10},{id:'b',description:'Pending material',unit:'ea',quantity:1,unitCost:0,priceMissing:true}]}],proposal:{intro:'',scope:'',notes:'',exclusions:'',terms:''}}
 await db.query('update estimates set document=$1 where id=$2',[JSON.stringify(document),source.id])
 const input={id:randomUUID(),requestId:randomUUID(),sourceId:source.id,projectId:S.leadA};invoice=await rpc(S.kevin,'invoice-create',input)
 expect((await rpc(S.kevin,'invoice-create',input)).id).toBe(invoice.id)
 expect(invoice.known_subtotal_cents).toBe(2720);expect(invoice.total_cents).toBeNull();expect(invoice.tax_amount).toBeNull();expect(invoice.lines[1].unitPrice).toBeNull();expect(invoice.preliminary).toBe(true)
 expect(invoice.source_estimate_id).toBe(source.id);expect(invoice.source_snapshot.document.sections[0].items[0].unitCost).toBe(10)
})
it('restricts all invoices to organization managers including direct grants and foreign sources',async()=>{
 for(const actor of [S.a,S.b,S.worker])await expect(rpc(actor,'invoices')).rejects.toThrow(/MANAGER_REQUIRED|ACCESS_DENIED/)
 expect(await rpc(S.otherManager,'invoices')).toHaveLength(0)
 await expect(rpc(S.otherManager,'invoice-save',{id:invoice.id})).rejects.toThrow('INVOICE_DENIED')
 await expect(rpc(S.otherManager,'invoice-create',{id:randomUUID(),requestId:randomUUID(),sourceId:source.id,projectId:S.otherLead})).rejects.toThrow('SOURCE_DENIED')
 await expect(asSalesUser(db,S.kevin,tx=>tx.query('update commercial_invoices set total_cents=0'))).rejects.toThrow(/permission denied/)
})
it('saves deterministic reviewed amounts, version conflict and immutable source snapshot',async()=>{
 const lines=invoice.lines.map((l,i)=>({...l,unitPrice:i?5:l.unitPrice}))
 const input={id:invoice.id,requestId:randomUUID(),version:invoice.version,title:'Internal QA document',lines,taxAmount:0,taxNote:'Explicit synthetic zero; no tax rule inferred',notes:'Not issued',status:'internal_reviewed'}
 const saved=await rpc(S.kevin,'invoice-save',input),again=await rpc(S.kevin,'invoice-save',input)
 expect(saved.total_cents).toBe(3220);expect(again.version).toBe(saved.version);expect(saved.preliminary).toBe(false)
 expect(invoiceTotals({title:input.title,lines,taxAmount:0,taxNote:input.taxNote,notes:'Not issued',status:input.status}).totalCents).toBe(saved.total_cents)
 await expect(rpc(S.kevin,'invoice-save',{...input,requestId:randomUUID()})).rejects.toThrow('VERSION_CONFLICT')
 await db.query("update estimates set title='Later revision' where id=$1",[source.id])
 const stored=(await rpc(S.kevin,'invoices'))[0];expect(stored.source_snapshot.title).toBe('QA source');expect(stored.source_version).toBe(invoice.source_version)
 await expect(rpc(S.kevin,'invoice-save',{...input,requestId:randomUUID(),version:saved.version,lines:[...lines,lines[0]]})).rejects.toThrow('DUPLICATE_LINES')
 await expect(rpc(S.kevin,'invoice-save',{...input,requestId:randomUUID(),version:saved.version,taxAmount:-1})).rejects.toThrow('INVALID_TAX')
})
it('handles LA daylight saving boundaries and preserves request identity for exact retries',()=>{
 expect(laDateToIso('2026-07-01T09:00')).toBe('2026-07-01T16:00:00.000Z')
 expect(laDateToIso('2026-12-01T09:00')).toBe('2026-12-01T17:00:00.000Z')
 expect(laInput('2026-12-01T17:00:00Z')).toBe('2026-12-01T09:00')
 expect(()=>laDateToIso('2026-03-08T02:30')).toThrow('INVALID_LA_TIME')
 expect(()=>laDateToIso('2026-11-01T01:30')).toThrow('AMBIGUOUS_LA_TIME')
 const ref={current:null};const id=requestIdentity(ref,{x:1});expect(requestIdentity(ref,{x:1})).toBe(id);expect(requestIdentity(ref,{x:2})).not.toBe(id)
})
it('preserves source proposal cents across fractional unit prices and marks blank source detail pending',async()=>{
 const src=await salesRpc(db,S.a,'create-document',{id:randomUUID(),projectId:S.leadA,title:'QA source rounding'})
 const items=[{id:'x',description:'Small line A',quantity:3,unitCost:0.01,unit:'ea'},{id:'y',description:'Small line B',quantity:3,unitCost:0.01,unit:'ea'}]
 await db.query('update estimates set document=$1 where id=$2',[JSON.stringify({sections:[{id:'s',title:'Rounding',items}],proposal:{}}),src.id])
 const x=await rpc(S.kevin,'invoice-create',{id:randomUUID(),requestId:randomUUID(),sourceId:src.id,projectId:S.leadA})
 expect(x.known_subtotal_cents).toBe(8)
 expect(invoiceTotals({title:x.title,lines:x.lines,taxAmount:null,taxNote:'',notes:'',status:'internal_draft'}).knownSubtotalCents).toBe(8)
 await db.query('update estimates set document=$1 where id=$2',[JSON.stringify({sections:[{id:'s',title:'Pending',items:[{id:'blank',description:'',quantity:1,unitCost:0,unit:'ea'}]}],proposal:{}}),src.id])
 const pending=await rpc(S.kevin,'invoice-create',{id:randomUUID(),requestId:randomUUID(),sourceId:src.id,projectId:S.leadA})
 expect(pending.lines[0].unitPrice).toBeNull();expect(pending.lines[0].quantity).toBeNull();expect(pending.preliminary).toBe(true)
})
