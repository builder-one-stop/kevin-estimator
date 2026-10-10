import { createRuntime } from './runtime.js'
import { createEstimatorServer } from './http.js'
const { repo, provider } = createRuntime()
const {server}=createEstimatorServer({repo,provider,origin:process.env.APP_ORIGIN||'http://127.0.0.1:5173'})
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.info('Estimator API listening on loopback; secrets and job content are not logged'))
