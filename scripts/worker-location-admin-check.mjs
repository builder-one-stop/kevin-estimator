// Optional existing-manager verification; credentials remain only in this process.
import {hiddenInput} from './hidden-beta-input.mjs'
import {readFile} from 'node:fs/promises'
const started=Date.now()
let formServer,timer
const credentials=await Promise.race([
 hiddenInput([{name:'email',type:'email',label:'Correo actual de Kevin o administración'},{name:'password',label:'Contraseña actual (no se cambiará)'}],{port:8792,onReady:(url,server)=>{formServer=server;console.info(`Administrative verification form ready: ${url}`)}}),
 new Promise((_,reject)=>{timer=setTimeout(()=>{formServer?.closeAllConnections();formServer?.close();reject(new Error('Administrative input not received; verification remains pending'))},15*60000)})
]);clearTimeout(timer)
console.info('Administrative input received in memory; waiting for published verification readiness.')
for(let deadline=Date.now()+20*60000;Date.now()<deadline;){
 let ready
 try{ready=JSON.parse(await readFile('evidence/worker-location/ready.json','utf8'))}catch{}
 if(ready?.createdAt>started){const {runLocationRemote}=await import('./worker-location-remote.mjs');await runLocationRemote({credentials});credentials.password='';credentials.email='';process.exit();}
 await new Promise(r=>setTimeout(r,3000))
}
credentials.password='';throw new Error('Publication readiness timeout; administrative verification remains pending')
