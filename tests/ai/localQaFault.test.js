import {describe,it,expect,vi} from 'vitest'
import {mkdtempSync,writeFileSync,existsSync,rmdirSync,unlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {localQaFault} from '../../scripts/local-qa-fault.mjs'
describe('explicit one-shot isolated network faults',()=>{
 it('rejects exactly one command and leaves normal requests untouched',()=>{
  const dir=mkdtempSync(join(tmpdir(),'onestop-qa-')),file=join(dir,'fault.json')
  try{writeFileSync(file,JSON.stringify({mode:'reject-next-command'}))
   const request={method:'POST',url:'/api/ai/conversations/test/commands',resume:vi.fn()},response={setHeader:vi.fn(),end:vi.fn()}
   expect(localQaFault({...request,method:'GET'},response,file)).toBe(false)
   expect(existsSync(file)).toBe(true)
   expect(localQaFault(request,response,file)).toBe(true)
   expect(response.statusCode).toBe(503)
   expect(request.resume).toHaveBeenCalledOnce()
   expect(localQaFault(request,response,file)).toBe(false)
   expect(localQaFault(request,response,undefined)).toBe(false)
  }finally{if(existsSync(file))unlinkSync(file);rmdirSync(dir)}
 })
 it('delays only acknowledgement, preserving the actual response and consuming its configuration once',()=>{
  const dir=mkdtempSync(join(tmpdir(),'onestop-qa-')),file=join(dir,'fault.json')
  vi.useFakeTimers()
  try{writeFileSync(file,JSON.stringify({mode:'delay-next-command-response',delayMs:1200}))
   const end=vi.fn(),response={end}
   expect(localQaFault({method:'POST',url:'/api/ai/conversations/test/commands'},response,file)).toBe(false)
   response.end('synthetic acknowledgement');expect(end).not.toHaveBeenCalled();expect(existsSync(file)).toBe(false)
   vi.advanceTimersByTime(1200);expect(end).toHaveBeenCalledExactlyOnceWith('synthetic acknowledgement')
  }finally{vi.useRealTimers();if(existsSync(file))unlinkSync(file);rmdirSync(dir)}
 })
})
