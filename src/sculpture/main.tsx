import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { KeypadProvider } from '../components/NumericKeypad'
import { SculptureApp } from './SculptureApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KeypadProvider>
      <SculptureApp />
    </KeypadProvider>
  </StrictMode>,
)
