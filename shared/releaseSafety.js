const expected='https://vtpciccluvpaclbeqxih.supabase.co'
export function releaseConfigurationIssues(env){
 const errors=[]
 if(env.VITE_SUPABASE_URL?.replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'')!==expected)errors.push('PUBLIC_SUPABASE_TARGET_INVALID')
 const key=env.VITE_SUPABASE_ANON_KEY||''
 let claims=null
 try{claims=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{/* Publishable keys are not JWTs. */}
 if(!key || (!key.startsWith('sb_publishable_')&&!(claims?.role==='anon'&&claims.ref==='vtpciccluvpaclbeqxih')))errors.push('PUBLIC_SUPABASE_KEY_INVALID')
 if(Object.keys(env).some(k=>/^VITE_.*(SECRET|SERVICE_ROLE|OPENAI_API_KEY|ACCESS_TOKEN|PASSWORD)/i.test(k)))errors.push('PRIVATE_VARIABLE_EXPOSED_TO_VITE')
 if(['VITE_LOCAL_SALES','VITE_LOCAL_REVIEW','VITE_AI_FIXTURE','VITE_TEST_MODE'].some(k=>env[k]==='true'||env[k]==='1'))errors.push('SYNTHETIC_MODE_IN_PRODUCTION')
 return errors
}
