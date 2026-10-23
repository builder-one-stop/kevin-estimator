// Public configuration only. This launcher never loads .env.server.local or a service key.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const config = JSON.parse(readFileSync(resolve('.local-review/real-frontend-public.json'), 'utf8'))
if (config.url !== 'https://vtpciccluvpaclbeqxih.supabase.co') throw Error('Unexpected public Supabase target')
const key = config.publishableKey
let publicRole = false
if (typeof key === 'string' && key.startsWith('sb_publishable_')) publicRole = true
else if (typeof key === 'string') {
  try { const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); publicRole = claims.role === 'anon' && claims.ref === 'vtpciccluvpaclbeqxih' } catch { /* Reject without logging key. */ }
}
if (!publicRole) throw Error('Only an existing publishable or anon key for the verified project is allowed')
const origin = 'http://localhost:5173'
const boundary = { name:'real-local-boundary', configureServer(vite) {
  vite.middlewares.use((req,res,next) => {
    if (req.url.startsWith('/__fixture/')) { res.statusCode=404; res.end('Controlled sessions are unavailable on the real frontend.'); return }
    next()
  })
} }
const vite = await createServer({ configFile:false, cacheDir:'node_modules/.vite-one-stop-real', envDir:false, envPrefix:[], plugins:[react(),boundary],
  define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(config.url),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(key),'import.meta.env.VITE_SALES_ENABLED':JSON.stringify(process.env.ONE_STOP_SALES_ENABLED==='true'?'true':'false')},
  server:{host:'127.0.0.1',port:5173,strictPort:true,origin,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.local-review/**']},proxy:{'/api/ai':'http://127.0.0.1:8787','/api/workers':'http://127.0.0.1:8787'}} })
await vite.listen()
console.info('ONE STOP REAL FRONTEND: '+origin+'/chat')
console.info('Real Supabase and API 8787. Sign in using your own authorized account. No controlled fixture session is available here.')
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await vite.close();process.exit(0)})
