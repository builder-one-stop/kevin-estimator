import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PaintRuleEditor from '../../src/components/ai/PaintRuleEditor.jsx'
import { defaultPaintTemplate } from '../../shared/paintJob.js'
import { researchCatalog } from '../../shared/researchCatalog.js'

describe('painting editor initial render',()=>{
  it.each(['en','es'])('renders saved painting rules in %s without accessing state before initialization',language=>{
    const rule={template:defaultPaintTemplate(),inputs:{lengthFt:12,widthFt:10,heightFt:8,openingsSqFt:0,useGrossWalls:true},areaSqFt:352,version:'interior-walls-1'}
    const html=renderToStaticMarkup(createElement(PaintRuleEditor,{rule,catalog:researchCatalog,language,onRecalculate:()=>{}}))
    expect(html).toContain('352 sf')
    expect(html).toContain(language==='es'?'rendimiento provisional':'provisional coverage')
    expect(html).toContain(language==='es'?'Recalcular pintura':'Recalculate painting')
  })
})
