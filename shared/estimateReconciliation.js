import {reconcilePaintExpenses} from './paintReconciliation.js'
import {reconcileTradeExpenses} from './tradeRules.js'
export const reconcileEstimateExpenses=document=>reconcileTradeExpenses(reconcilePaintExpenses(document))
