import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { KeypadProvider } from './components/NumericKeypad'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <KeypadProvider>
        <App />
      </KeypadProvider>
    </ErrorBoundary>
  </StrictMode>,
)
