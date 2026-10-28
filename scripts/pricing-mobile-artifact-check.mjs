import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),out='evidence/pricing-mobile-2026-10-28'
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)])
const functions=files('netlify/functions').filter(f=>f.endsWith('.mjs')),report={scope:'Local source/import and compiled fixture frontend audit; NOT Netlify deployment or ZIP validation',functions:[],nativeDependencies:[],packagerAvailable:false,privateValueMatches:[],configurationFilesInDist:[]}
let networkCalls=0;globalThis.fetch=()=>{networkCalls++;throw Error('Network prohibited in artifact audit')}
for(const file of functions){const mod=await import(new URL('../'+file.replaceAll('\\','/'),import.meta.url));if(typeof mod.default!=='function')throw Error('Function export absent: '+file);report.functions.push({file,defaultHandler:true,background:mod.config?.background===true,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})}
for(const p of ['sharp','@img/sharp-linux-x64','@img/sharp-libvips-linux-x64']){const manifest=path.join('node_modules',p,'package.json');report.nativeDependencies.push({package:p,available:fs.existsSync(manifest)})}
try{require.resolve('@netlify/zip-it-and-ship-it');report.packagerAvailable=true}catch{/* Packaging not installed; do not invent a deployment artifact. */}
const artifacts=files('dist');report.configurationFilesInDist=artifacts.filter(f=>/\.env|\.pem$|\.key$/.test(f))
const envPath=process.argv[2];if(envPath){const values=fs.readFileSync(envPath,'utf8');for(const line of values.split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(!m||!/SECRET|SERVICE_ROLE|API_KEY|ACCESS_TOKEN|PASSWORD/.test(m[1]))continue;const v=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');if(v.length<16)continue;for(const f of [...artifacts,...functions])if(fs.readFileSync(f).includes(Buffer.from(v)))report.privateValueMatches.push({variable:m[1],file:f})}}
report.networkCalls=networkCalls;report.zipProduced=false;report.status=report.privateValueMatches.length||report.configurationFilesInDist.length||networkCalls?'failed':'passed-with-packaging-limitation'
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/artifact-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.status==='failed')process.exitCode=1
