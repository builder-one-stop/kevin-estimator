import {it,expect,vi} from 'vitest'
import {captureEntryLocation,locationOptions,locationMapUrl} from './workerLocation.js'
it('uses a new foreground fix without requiring a granted permissions state',async()=>{
 const geo={getCurrentPosition:vi.fn(resolve=>resolve({coords:{latitude:34.05,longitude:-118.25,accuracy:250},timestamp:Date.now()}))}
 const result=await captureEntryLocation(geo);expect(result.accuracy).toBe(250);expect(geo.getCurrentPosition.mock.calls[0][2]).toEqual({enableHighAccuracy:true,maximumAge:0,timeout:15000});expect(locationOptions.maximumAge).toBe(0)
 expect(decodeURIComponent(locationMapUrl(result))).toContain('query=34.05,-118.25')
})
it('maps denial, timeout and unavailable fixes to recoverable errors',async()=>{
 for(const [code,message] of [[1,'GEO_DENIED'],[2,'GEO_UNAVAILABLE'],[3,'GEO_TIMEOUT']])await expect(captureEntryLocation({getCurrentPosition:(_ok,bad)=>bad({code})})).rejects.toThrow(message)
 await expect(captureEntryLocation(null)).rejects.toThrow('GEO_UNAVAILABLE')
 await expect(captureEntryLocation({getCurrentPosition:ok=>ok({coords:{latitude:91,longitude:0,accuracy:10},timestamp:Date.now()})})).rejects.toThrow('GEO_UNAVAILABLE')
})
it('times out even if a browser never calls either callback',async()=>{
 vi.useFakeTimers();const pending=expect(captureEntryLocation({getCurrentPosition(){}})).rejects.toThrow('GEO_TIMEOUT');await vi.advanceTimersByTimeAsync(16000);await pending;vi.useRealTimers()
})
