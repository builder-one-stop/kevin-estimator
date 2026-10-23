import {HybridWorkProvider} from './hybridWorkProvider.js'
import {fail} from '../shared/aiDomain.js'
export {selectionSchema,validateTradeSelection} from './hybridWorkProvider.js'
// Synthetic-only local wrapper. Never use it to configure a deployed runtime.
export class IsolatedTradeProvider extends HybridWorkProvider{
 constructor(env,options){
  if(env.ONE_STOP_ISOLATED_REAL_TRADES!=='1')throw fail('ISOLATED_TRADES_DISABLED')
  super(env,options);this.isolatedRealTrades=true
 }
 async run(input){
  if(input.images?.length)throw fail('ISOLATED_SYNTHETIC_TEXT_ONLY')
  if(!['plan','generate'].includes(input.mode))throw fail('ISOLATED_TRADE_USE_EDITOR')
  return super.run(input)
 }
}
