// This check reports codes only; never echo environment values or key fragments.
import {loadEnv} from 'vite'
import {releaseConfigurationIssues} from '../shared/releaseSafety.js'
const issues=releaseConfigurationIssues({...loadEnv('production',process.cwd(),''),...process.env})
if(issues.length){console.error(JSON.stringify({releaseConfiguration:'blocked',issues}));process.exitCode=1}
else console.info('Release public configuration verified; target One Stop, no synthetic mode or private frontend variable names.')
