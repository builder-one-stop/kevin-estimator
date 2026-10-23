// Explicit one-shot fault injection for the isolated local harness only. Never imported by the real API.
import {existsSync,readFileSync,unlinkSync} from 'node:fs'
export function localQaFault(request,response,file,provider){
 if(!file||request.method!=='POST'||!request.url.split('?')[0].endsWith('/commands')||!existsSync(file))return false
 const fault=JSON.parse(readFileSync(file,'utf8'))
 if(!['reject-next-command','delay-next-command-response','slow-next-controlled-provider'].includes(fault.mode))throw Error('INVALID_LOCAL_QA_FAULT')
 unlinkSync(file)
 if(fault.mode==='slow-next-controlled-provider'){if(provider?.localTrades!==true)throw Error('CONTROLLED_PROVIDER_REQUIRED');provider.nextDelayMs=Math.min(5000,Math.max(0,Number(fault.delayMs)||0));return false}
 if(fault.mode==='reject-next-command'){request.resume();response.statusCode=503;response.setHeader('Content-Type','application/json');response.end(JSON.stringify({error:'API_UNAVAILABLE'}));return true}
 const delay=Math.min(5000,Math.max(0,Number(fault.delayMs)||0)),end=response.end.bind(response)
 response.end=(...args)=>{setTimeout(()=>end(...args),delay);return response}
 return false
}
