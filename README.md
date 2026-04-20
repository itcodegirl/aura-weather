# Aura — Atmospheric Intelligence

A sophisticated weather dashboard with a bento-grid layout, weather-reactive gradients, and real-time atmospheric data. Built with React, Vite, and plain CSS.

**[Live demo](https://your-deploy-url-here.com)** · **[Screenshots](#screenshots)**

![Aura screenshot metric-card](./public/screenshot.png)

---

## Why Aura

Most weather apps show the same five data points in the same static layout. Aura is built for people who actually read weather data — hourly precipitation probability, pressure trends, dewpoint comfort, and storm intelligence, all presented in a modern bento-grid interface that shifts gradients based on current conditions.

The goal: a weather app that *feels like a product*, not a tutorial clone.

---

## Features

- **Reactive gradient backgrounds** that shift based on live weather conditions (clear, cloudy, rainy, stormy)
- **Bento-grid dashboard** with hero card, hourly chart, 7-day forecast, and specialized weather panels
- **Real atmospheric data** via Open-Meteo's free public API — no API key required
- **Geolocation auto-detect** with graceful fallback
- **Unit toggle** between °F and °C
- **Accessible by default** — semantic HTML, ARIA labels, keyboard navigation
- **Responsive** — bento grid adapts from desktop to mobile

---

## Tech Stack

- **React 19** with hooks and custom hook architecture
- **Vite 8** for fast development and optimized builds
- **Plain CSS** with design tokens, CSS Grid, and glassmorphism
- **Open-Meteo API** for weather, air quality, and geocoding
- **Recharts** for data visualization
- **Lucide React** for icons

---

## Architecture

The codebase separates concerns cleanly:

src/
├── components/      # Presentation components
├── hooks/           # Custom React hooks (data logic)
├── services/        # API layer (pure functions, no React)
├── utils/           # Domain utilities (weather codes, meteorology)
├── App.jsx          # Root component
└── App.css          # Styles with design tokens

The `weatherApi.js` service layer contains zero React — it's pure data fetching, fully portable. The `useWeather` hook handles all state and side effects. Components stay focused on presentation.

---

## Running locally

```bash
npm install
npm run dev
```

Roadmap
- [ ] Storm Watch panel (CAPE, pressure trend, wind compass, dewpoint comfort)
- [ ] Rain intelligence card with 24h precipitation timeline
- [ ] Minute-by-minute nowcast (15-min resolution)
- [ ] NWS severe weather alerts (US)
- [ ] Live precipitation radar via RainViewer API
- [ ] Historical climate comparison
- [ ] Saved cities + quick-switch