import {it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {createElement} from 'react'
import {MaterialCatalogService} from '../../server/materialCatalog.js'
import {matchesMaterialRole,materialTextSuggestion} from '../../shared/materialSelection.js'
import {makePaintItems,defaultPaintTemplate} from '../../shared/paintJob.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
import PaintRuleEditor from '../../src/components/ai/PaintRuleEditor.jsx'
it('finds multiword reference suggestions across fields, regardless of word order, accents or repeated whitespace, while exact selectors remain exact',()=>{
 const service=new MaterialCatalogService()
 const result=service.search({q:'  eggshell   BEHR   1 US gal ',role:'paint'})
 expect(result).toMatchObject({matchType:'suggestions',externallyQueried:false,total:1});expect(result.rows[0].sourceId).toBe('HD01')
 expect(service.search({sku:'43305',role:'paint'}).total).toBe(0)
 expect(service.search({sku:' 433052 ',role:'paint'}).matchType).toBe('exact')
 expect(materialTextSuggestion({product:'Pintura interior',variant:'blánco mate',vendor:'Tienda de prueba'},'MATE   blanco interior')).toBe(true)
 expect(materialTextSuggestion({product:'Pintura interior'},'exterior')).toBe(false)
 expect(service.search({q:'',role:'paint'}).rows).toHaveLength(6)
})
it.each(['primer','patch','abrasive','protection'])('does not offer a %s as finishing paint even when its package has volume',category=>{
 const p={...researchCatalog[0],category}
 expect(matchesMaterialRole(p,'paint')).toBe(false)
 const doc=makePaintItems('t',{lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true},defaultPaintTemplate(),[p])
 expect(doc.items.find(x=>x.ruleKey==='painting:material')).toMatchObject({quantityPending:true,priceMissing:true})
})
it.each(['Shrink Free Spackling','Wall Primer','Primer for paint','Patch filler'])('keeps an unclassified %s out of paint suggestions',product=>expect(matchesMaterialRole({product},'paint')).toBe(false))
it.each(['Synthetic interior paint','Interior Paint & Primer','Interior Paint + Primer','Pintura interior','Interior Paint and Primer'])('allows a classified product name %s only as a suggestion requiring an exact selected reference',product=>expect(matchesMaterialRole({product},'paint')).toBe(true))
it.each(['en','es'])('shows exact known paint with missing price as pending, and excludes quart filler and primer in the %s rule selector',language=>{
 const pending={...researchCatalog[0],id:'pending-paint',sourceId:undefined,unitCost:null,status:'quote_required',product:'Synthetic pending interior paint'}
 const html=renderToStaticMarkup(createElement(PaintRuleEditor,{rule:{template:defaultPaintTemplate(),inputs:{lengthFt:12,widthFt:10,heightFt:8},areaSqFt:352,version:'interior-walls-1'},catalog:[...researchCatalog,pending],language,onRecalculate:()=>{}}))
 const paint=html.match(new RegExp(`<select aria-label="${language==='es'?'Pintura':'Paint'}"[^>]*>([\\s\\S]*?)</select>`))[1]
 expect(paint).toContain('Synthetic pending interior paint');expect(paint).toContain(language==='es'?'Precio pendiente':'Price pending')
 expect(paint).not.toContain('Spackling');expect(paint).not.toContain('KILZ');expect(paint).not.toContain('USD null')
 expect(html).toContain(language==='es'?'para evitar cobrar ambos':'to avoid charging both')
})
it('does not alter reference prices, source dates or verification when suggesting products',()=>{
 const service=new MaterialCatalogService(),before=JSON.stringify(service.rows)
 service.search({q:'BEHR eggshell'});service.search({q:'  primer white '})
 expect(JSON.stringify(service.rows)).toBe(before)
 expect(service.rows.filter(x=>x.unitCost!==null)).toHaveLength(20)
 expect(service.rows.every(x=>x.checkedAt==='2026-10-17'&&x.verifiedZip===null)).toBe(true)
})
