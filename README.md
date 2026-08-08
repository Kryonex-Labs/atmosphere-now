# Atmosphere Now

A location-aware, single-page environmental dashboard. The page requests the visitor's browser location, then shows current weather and air-quality conditions from open data services. No API key is required.

## Readings and sources

| Reading | Source | Notes |
| --- | --- | --- |
| Temperature / heat index | [Open-Meteo Weather API](https://open-meteo.com/en/docs) | Uses air and apparent temperature. |
| Wind speed / direction | Open-Meteo Weather API | Modelled at 10 metres. |
| Humidity | Open-Meteo Weather API | Relative humidity at 2 metres. |
| Atmospheric pressure | Open-Meteo Weather API | Local surface pressure in hPa. |
| PM2.5 / PM10 | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | CAMS model data for the closest grid cell. |
| Noise | Device microphone | Optional relative dBFS estimate. It is not a calibrated dBA sound-pressure reading. Audio is never uploaded. |
| Light intensity | Device sensor or Open-Meteo | Uses `AmbientLightSensor` when the browser supports it; otherwise shows an explicitly marked outdoor lux estimate derived from modelled solar radiation. |

Browser geolocation and device sensors require a secure context (HTTPS or localhost) and user permission. Coordinates are sent directly to Open-Meteo and are not stored by this application.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server and allow location access.

## Validate

```bash
npm run build
npm test
```

## Technology

- React 19 and TypeScript
- vinext / Vite
- Cloudflare Worker-compatible output
- Open-Meteo's open-source weather and air-quality APIs
