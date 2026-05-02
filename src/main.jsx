import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'

// Dev-only: enables `?mock=missing` to reproduce the missing-data
// trust contract on demand for screenshots and ad-hoc QA. Production
// builds tree-shake this branch entirely because of the DEV guard.
// Top-level await ensures the fetch override is in place before the
// app's first weather request fires.
if (import.meta.env.DEV) {
  const { installMissingDataMockIfRequested } = await import(
    './dev/missingDataMock.js'
  )
  installMissingDataMockIfRequested()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
