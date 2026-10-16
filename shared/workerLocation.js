// One foreground fix per clock-in attempt. Accuracy is descriptive, not a gate.
export const locationOptions = Object.freeze({enableHighAccuracy:true,maximumAge:0,timeout:15000})
export const lowAccuracyMeters = 100
export function validLocation(value) {
 return !!value && typeof value.latitude==='number' && Number.isFinite(value.latitude) && Math.abs(value.latitude)<=90 &&
  typeof value.longitude==='number' && Number.isFinite(value.longitude) && Math.abs(value.longitude)<=180 &&
  typeof value.accuracy==='number' && Number.isFinite(value.accuracy) && value.accuracy>=0 && Number.isFinite(Date.parse(value.capturedAt))
}
export function captureEntryLocation(geo=globalThis.navigator?.geolocation) {
 return new Promise((resolve,reject)=>{
  if(!geo){reject(new Error('GEO_UNAVAILABLE'));return}
  let done=false
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(new Error(error));else resolve(value)}
  const timer=setTimeout(()=>finish('GEO_TIMEOUT'),locationOptions.timeout+1000)
  try{geo.getCurrentPosition(position=>{
   const value={latitude:position.coords?.latitude,longitude:position.coords?.longitude,accuracy:position.coords?.accuracy,capturedAt:Number.isFinite(new Date(position.timestamp).getTime())?new Date(position.timestamp).toISOString():''}
   finish(validLocation(value)?null:'GEO_UNAVAILABLE',value)
  },error=>finish(({1:'GEO_DENIED',2:'GEO_UNAVAILABLE',3:'GEO_TIMEOUT'})[error.code]||'GEO_UNAVAILABLE'),locationOptions)}catch{finish('GEO_UNAVAILABLE')}
 })
}
export function locationMapUrl(value) {
 return validLocation(value)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${value.latitude},${value.longitude}`)}`:null
}
