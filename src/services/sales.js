import {supabase} from '../supabaseClient.js'
import {salesEnvironment} from '../../shared/salesEnvironment.js'
// A production capability flag is separate from the synthetic review launcher.
export const localSalesEnabled=salesEnvironment(import.meta.env).enabled
export async function salesRequest(action,data={}){const result=await supabase.rpc('sales_gateway',{p_action:action,p_data:data});if(result.error)throw result.error;return result.data}
