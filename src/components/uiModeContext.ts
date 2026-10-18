import { createContext, useContext } from 'react'

// BL-103: whether Simple Mode is on — read by the wizard steps and Settings
// to hide the fields Simple doesn't show. App.tsx provides it.
export const SimpleModeContext = createContext(false)

export function useSimpleMode(): boolean {
  return useContext(SimpleModeContext)
}
