// Navigation is defense in depth; SQL/API independently authorize every request.
export function sellerPathAllowed(path){return /^\/projects(?:\/[\da-f-]+(?:\/estimates)?)?\/?$/i.test(path)||/^\/estimates(?:\/[\da-f-]+)?\/?$/i.test(path)||/^\/chat(?:\/[\da-f-]+)?\/?$/i.test(path)}
export function sellerApiAllowed(parts,method){
 if(parts[0]==='settings')return method==='GET'
 return ['status','conversations','estimates','pricing','assets'].includes(parts[0])
}
