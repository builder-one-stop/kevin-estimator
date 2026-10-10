import { chromium, webkit, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { startHarness } from './ai-local-harness.mjs'
import { B } from '../tests/ai/localRepository.js'
const out='evidence/chat-experience';await mkdir(out,{recursive:true})
const h=await startHarness(), report={environment:'Isolated migrated database, controlled provider; no customer data',checks:[],errors:[]}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const original=h.provider.run.bind(h.provider)
h.provider.run=async input=>{await input.onText('Public response arriving from the controlled server.');await wait(1800);await input.onText('Public response arriving from the controlled server. Review the completed plan before approval.');await wait(1800);return original(input)}
const session={access_token:'fixture-b',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:B,email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated'}}
try{
 for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
  const browser=await engine.launch({...(name==='chrome'?{channel:'chrome'}:{}),headless:true})
  try{
   for(const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport}),page=await context.newPage()
    page.on('pageerror',e=>report.errors.push(e.message))
    try{
     await page.goto(h.url);await expect(page.locator('.login-screen')).toBeVisible()
     await page.getByLabel('Email',{exact:true}).fill('visual-test@example.invalid');await page.getByLabel('Password',{exact:true}).fill('Synthetic-only')
     const colors=await page.locator('.login-card input').evaluateAll(nodes=>nodes.map(n=>({color:getComputedStyle(n).color,fill:getComputedStyle(n).webkitTextFillColor,background:getComputedStyle(n).backgroundColor,placeholder:getComputedStyle(n,'::placeholder').color})))
     if(colors.some(c=>c.color!=='rgb(32, 32, 32)'||c.background!=='rgb(255, 255, 255)'||c.placeholder!=='rgb(102, 102, 102)'))throw new Error('Login contrast mismatch')
     if(name==='chrome'){
      const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument')
      const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.login-card input'})
      await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['autofill']})
      const fill=await page.locator('.login-card input').first().evaluate(n=>getComputedStyle(n).webkitTextFillColor)
      if(fill!=='rgb(32, 32, 32)')throw new Error('Autofill text contrast mismatch')
      await cdp.detach()
     }
     await page.screenshot({path:`${out}/login-${name}-${size}.png`})
     report.checks.push(`${name} ${size}: light inputs, dark typed/password/placeholder text; Chrome forced autofill pseudo-state checked where applicable`)
     await page.evaluate(s=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(s));localStorage.setItem('os-lang','en')},session)
     await page.goto(h.url);await expect(page.getByRole('heading',{name:'Recent estimates'})).toBeVisible()
     await expect(page.locator('.greet')).not.toContainText('Kevin');await expect(page.locator('.hint')).not.toContainText('pending setup')
     let row=await h.repo.commit(B,{id:randomUUID(),title:`Synthetic room painting ${name} ${size}`,client_id:null,project_id:null,state:{messages:Array.from({length:18},(_,i)=>({id:randomUUID(),role:i%2?'assistant':'user',content:`Synthetic message ${i+1}. Walls only, with protection and preparation. `.repeat(3),createdAt:new Date().toISOString()})),plan:null,planRevision:0,approvedRevision:null,documentLanguage:'en',receipts:[],runs:[]}},0)
     await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible()
     await expect(page.getByRole('dialog').getByRole('link',{name:new RegExp(row.title)})).toBeVisible()
     await page.screenshot({path:`${out}/history-${name}-${size}.png`})
     await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'History',exact:true})).toBeFocused()
     await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('dialog').getByRole('link',{name:new RegExp(row.title)}).click()
     await expect(page.locator('.ai-message')).toHaveCount(18)
     const input=page.getByRole('textbox',{name:'Describe the work or request a change'})
     const sent='Synthetic scope clarification, confirmed provisional assumptions.'
     await input.fill(sent)
     let posts=0
     await page.route('**/commands',async route=>{posts++;await wait(900);await route.continue()})
     await page.getByRole('button',{name:'Send',exact:true}).evaluate(button=>{button.click();button.click()})
     await expect(page.locator('.ai-message.pending')).toContainText(sent)
     await expect(page.locator('.ai-activity')).toBeVisible()
     await expect(page.getByTestId('stream-preview')).toBeVisible({timeout:15000})
     await page.screenshot({path:`${out}/progress-${name}-${size}.png`})
     await page.locator('.ai-thread').evaluate(n=>{n.scrollTop=0;n.dispatchEvent(new Event('scroll'))})
     await expect(page.getByRole('button',{name:'New content',exact:true})).toBeVisible({timeout:15000})
     if(await page.locator('.ai-thread').evaluate(n=>n.scrollTop)>5)throw new Error('Reading position jumped')
     await expect(page.getByRole('button',{name:'Approve this revision'})).toBeEnabled({timeout:15000})
     if(posts!==1)throw new Error('Duplicate command submitted')
     row=await h.repo.get(B,row.id);if(row.state.messages.filter(m=>m.content===sent).length!==1)throw new Error('Duplicate user message')
     const box=await page.locator('.ai-composer').boundingBox();if(!box||box.y<0||box.y+box.height>viewport.height)throw new Error('Composer outside viewport')
     await input.fill('Pending bilingual draft');await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('es')
     await expect(page.getByRole('textbox',{name:'Describe el trabajo o pide un cambio'})).toHaveValue('Pending bilingual draft')
     await page.getByRole('combobox',{name:'Idioma de la interfaz',exact:true}).selectOption('en')
     await page.getByRole('button',{name:'New content',exact:true}).click()
     await page.locator('.ai-message.assistant').last().scrollIntoViewIfNeeded()
     await page.screenshot({path:`${out}/chat-${name}-${size}.png`})
     await page.unroute('**/commands')
     if(name==='chrome'&&size==='desktop'){
      await page.route('**/commands',route=>route.abort())
      await input.fill('Recover this unsent message');await page.getByRole('button',{name:'Send',exact:true}).click()
      await expect(page.getByRole('button',{name:'Retry send',exact:true})).toBeVisible()
      await page.reload();await expect(page.getByRole('button',{name:'Retry send',exact:true})).toBeVisible()
      await page.unroute('**/commands');await page.getByRole('button',{name:'Retry send',exact:true}).click()
      await expect(page.getByRole('button',{name:'Approve this revision'})).toBeEnabled({timeout:15000})
      const after=await h.repo.get(B,row.id);if(after.state.messages.filter(m=>m.content==='Recover this unsent message').length!==1)throw new Error('Retry duplicated or lost message')
      report.checks.push('Unsent message survives failure and reload; explicit retry commits once with original request ID')
     }
     if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Horizontal page overflow')
     report.checks.push(`${name} ${size}: history drawer/resume/Escape, correct admin greeting, immediate message, real controlled-server preview, single submit, no scroll jump, new-content notice, visible composer and pending EN/ES text`)
    }finally{await context.close()}
   }
  }finally{await browser.close()}
 }
}catch(error){report.errors.push(error.message);process.exitCode=1}
finally{await writeFile(`${out}/visual-results.json`,JSON.stringify(report,null,2)+'\n');await h.close();console.log(JSON.stringify({checks:report.checks.length,errors:report.errors}))}
