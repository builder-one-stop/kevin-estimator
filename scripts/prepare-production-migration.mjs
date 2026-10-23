// Offline preparation only. Never connects to Supabase or runs generated SQL.
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {renderProductionMigration,validateEnrollment} from '../server/releaseEnrollment.js'
const directory=path.resolve('.local-review/release'),input=path.join(directory,'enrollment.json'),output=path.join(directory,'production-candidate.sql')
try{
 const manifest=validateEnrollment(JSON.parse(fs.readFileSync(input,'utf8')))
 const sql=renderProductionMigration(fs.readFileSync('supabase/migrations/20261023180600_one_stop_sales_commercial_hybrid_costs.sql','utf8'),manifest)
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(output,sql,{flag:'wx'})
 console.info(JSON.stringify({prepared:true,applied:false,registeredMigration:false,accounts:manifest.accounts.length,historicalProjects:manifest.historicalProjects.length,sha256:createHash('sha256').update(sql).digest('hex'),output:'.local-review/release/production-candidate.sql'}))
}catch{console.error('PREPARATION_STOPPED: verify the private enrollment manifest, exact identities/project inventory, transaction draft and output absence. No SQL executed.');process.exitCode=1}
