import { createContext, useContext } from 'react'

export const BetaAccessContext = createContext(null)
export const useBetaAccess = () => useContext(BetaAccessContext)
