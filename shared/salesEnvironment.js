export function salesEnvironment(env){
 const synthetic=env.DEV===true&&env.VITE_LOCAL_SALES==='true'
 return {synthetic,enabled:env.VITE_SALES_ENABLED==='true'||synthetic}
}
