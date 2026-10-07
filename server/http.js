import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { EstimatorEngine } from './engine.js'
import { settingsSchema, defaultSettings } from '../shared/aiSchemas.js'
import { fail } from '../shared/aiDomain.js'
export function createEstimatorServer({repo,provider,origin='http://127.0.0.1:5173',logger,testMode=false,requestsPerMinute=40}) {
 const engine=new EstimatorEngine(repo,provider,{logger});const limits=new Map()
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff')
  try {
   if(req.headers.origin && req.headers.origin!==origin)throw fail('ORIGIN_REJECTED',403)
   const auth=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
   if(!auth)throw fail('UNAUTHORIZED',401)
   const owner=await repo.authenticate(auth)
   const url=new URL(req.url,'http://localhost');const parts=url.pathname.replace(/^\/api\/ai\/?/,'').split('/').filter(Boolean)
   let body={}
   if(req.method!=='GET') {
    if(!req.headers['content-type']?.startsWith('application/json'))throw fail('JSON_REQUIRED',415)
    let size=0;const chunks=[]
    for await(const chunk of req){size+=chunk.length;if(size>7400000)throw fail('BODY_TOO_LARGE',413);chunks.push(chunk)}
    try{body=JSON.parse(Buffer.concat(chunks).toString())}catch{throw fail('INVALID_JSON')}
    const now=Date.now();let rate=limits.get(owner);if(!rate||now-rate.start>60000){rate={start:now,count:0};limits.set(owner,rate)}
    if(++rate.count>requestsPerMinute)throw fail('RATE_LIMIT',429)
    if(limits.size>1000)for(const [key,value]of limits)if(now-value.start>60000)limits.delete(key)
   }
   let data
   if(parts[0]==='status' && req.method==='GET')data={mode:testMode?'controlled-test':'real',configured:!!provider.client||testMode}
   else if(parts[0]==='settings') {
    if(req.method==='GET')data=(await repo.settings(owner))||{version:0,data:defaultSettings()}
    else if(req.method==='POST') {const x=z.object({version:z.number().int().min(0),data:settingsSchema}).strict().parse(body);data=await repo.saveSettings(owner,x.data,x.version)}
   } else if(parts[0]==='conversations') {
    const id=parts[1];if(id)z.string().uuid().parse(id)
    if(!id && req.method==='GET'){await repo.expire(owner);data=await repo.list(owner)}
    else if(!id && req.method==='POST')data=await engine.create(owner,body)
    else if(parts[2]==='commands' && req.method==='POST')data=await engine.command(owner,id,body)
    else if(parts[2]==='assets') {
     const conversation=await repo.get(owner,id)
     if(req.method==='GET')data=await repo.assets(owner,id)
     else if(req.method==='POST') {
      if(conversation.state.run?.status==='working')throw fail('RUN_BUSY',409)
      const x=z.object({data:z.string().max(7000000)}).strict().parse(body);const input=Buffer.from(x.data,'base64')
      if(input.length>5242880 || !input.length)throw fail('IMAGE_SIZE',413)
      const png=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpeg=input[0]===255 && input[1]===216 && input[2]===255;const webp=input.toString('ascii',0,4)==='RIFF' && input.toString('ascii',8,12)==='WEBP'
      if(!png&&!jpeg&&!webp)throw fail('IMAGE_TYPE',415)
      if((await repo.assets(owner,id)).length>=6)throw fail('IMAGE_LIMIT')
      let bytes;try{bytes=await sharp(input,{limitInputPixels:16000000,animated:false}).rotate().jpeg({quality:88}).toBuffer()}catch{throw fail('INVALID_IMAGE')}
      if(bytes.length>5242880)throw fail('IMAGE_SIZE',413)
      data=await repo.upload(owner,id,randomUUID(),bytes,'image/jpeg')
     }
    } else if(parts[2]==='revisions' && req.method==='GET') {const row=await repo.get(owner,id);data=row.estimate_id?await repo.revisions(owner,row.estimate_id):[]}
    else if(parts[2]==='estimate' && req.method==='GET') {const row=await repo.get(owner,id);data=row.estimate_id?await repo.estimate(owner,row.estimate_id):null}
    else if(parts.length===2 && req.method==='GET'){await repo.expire(owner);data=await repo.get(owner,id)}
   } else if(parts[0]==='assets' && parts[1]) {
    z.string().uuid().parse(parts[1])
    if(req.method==='GET') {const image=await repo.image(owner,parts[1]);res.setHeader('Content-Type',image.mime);res.end(image.bytes);return}
    if(req.method==='DELETE') {const asset=await repo.asset(owner,parts[1]);const row=await repo.get(owner,asset.conversation_id);if(row.state.run?.status==='working')throw fail('RUN_BUSY',409);await repo.deleteAsset(owner,parts[1]);data={deleted:true}}
   }
   if(data===undefined)throw fail('NOT_FOUND',404)
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))
  } catch(e) {
   res.statusCode=e.status || (e.name==='ZodError'?400:500)
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.code|| (e.name==='ZodError'?'INVALID_INPUT':'SERVER_ERROR')}))
  }
 });server.requestTimeout=150000;server.headersTimeout=15000
 return {server,engine}
}
