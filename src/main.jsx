import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import { startForecastPreload } from './api/forecastPreload.js'
import { resolveInitialLocationState } from './hooks/locationHelpers.js'
import { parseLocationFromUrl } from './hooks/useUrlLocationSync.js'
import { getPersistedLocation } from './hooks/useLocation.js'
import { isMissingMockEnabled } from './mocks/missingData.js'

// Dev-only endpoint mock for low-level missing-data QA. The user-facing
// `?mock=missing` portfolio demo is handled by the dashboard view model;
// this fetch override is only loaded in development builds.
// Top-level await ensures the fetch override is in place before the
// app's first weather request fires.
if (import.meta.env.DEV) {
  const { installMissingDataMockIfRequested } = await import(
    './dev/missingDataMock.js'
  )
  installMissingDataMockIfRequested()
}

// Fire the first forecast request before React mounts so its network
// round-trip overlaps app-shell hydration instead of waiting for the
// first effect. useWeatherData adopts this in-flight request when its
// first fetch matches these coordinates, so it is a pure head start with
// no behavioural change (on a miss the hook fetches as usual). Skipped
// for the missing-data demo (no live fetch) and while offline (the hook
// restores a cached snapshot instead). Best-effort: a failure here must
// never block boot.
try {
  const search =
    typeof window !== 'undefined' ? window.location?.search ?? '' : ''
  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false
  if (!isMissingMockEnabled(search) && !isOffline) {
    const { location } = resolveInitialLocationState({
      urlLocation: parseLocationFromUrl(),
      persistedLocation: getPersistedLocation(),
    })
    if (location) {
      startForecastPreload({
        latitude: location.lat,
        longitude: location.lon,
      })
    }
  }
} catch {
  // No-op: the app still renders and fetches normally without the head
  // start.
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
