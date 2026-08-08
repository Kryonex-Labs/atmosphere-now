import { useCallback, useEffect, useState } from "react";

type WeatherCurrent = {
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  surface_pressure: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  shortwave_radiation: number;
};

type AirCurrent = {
  pm10: number;
  pm2_5: number;
};

type Readings = {
  weather: WeatherCurrent;
  air: AirCurrent;
};

type DisplayCard = {
  label: string;
  value: string;
  unit?: string;
  description: string;
  tone: string;
};

const windLabels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function windDirection(degrees: number) {
  return windLabels[Math.round(degrees / 45) % 8];
}

function Card({ card }: { card: DisplayCard }) {
  return (
    <article className={`reading-card ${card.tone}`}>
      <div className="reading-value">
        <strong>{card.value}</strong>
        {card.unit && <span>{card.unit}</span>}
      </div>
      <div className="reading-copy">
        <h2>{card.label}</h2>
        <p>{card.description}</p>
      </div>
    </article>
  );
}

export default function EnvironmentDashboard() {
  const [readings, setReadings] = useState<Readings | null>(null);

  const loadReadings = useCallback(async (latitude: number, longitude: number) => {
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,shortwave_radiation",
      timezone: "auto",
    }).toString();

    const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    airUrl.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "pm10,pm2_5",
      timezone: "auto",
    }).toString();

    try {
      const [weatherResponse, airResponse] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
      if (!weatherResponse.ok || !airResponse.ok) return;

      const [weatherJson, airJson] = await Promise.all([weatherResponse.json(), airResponse.json()]);
      setReadings({ weather: weatherJson.current, air: airJson.current });
    } catch {
      // Preserve the last successful display; this page is intended for unattended screens.
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const requestLocation = () => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => loadReadings(coords.latitude, coords.longitude),
        () => undefined,
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
      );
    };

    const firstRequest = window.setTimeout(requestLocation, 0);
    const refresh = window.setInterval(requestLocation, 300000);
    return () => {
      window.clearTimeout(firstRequest);
      window.clearInterval(refresh);
    };
  }, [loadReadings]);

  const cards: DisplayCard[] = readings
    ? [
        { label: "Temperature", value: Math.round(readings.weather.temperature_2m).toString(), unit: "°C", description: "Air temperature at 2 metres", tone: "sun" },
        { label: "Heat index", value: Math.round(readings.weather.apparent_temperature).toString(), unit: "°C", description: "Feels-like temperature", tone: "coral" },
        { label: "Wind speed", value: Math.round(readings.weather.wind_speed_10m).toString(), unit: "km/h", description: "Measured at 10 metres", tone: "sky" },
        { label: "Wind direction", value: windDirection(readings.weather.wind_direction_10m), description: `${Math.round(readings.weather.wind_direction_10m)}° from north`, tone: "mist" },
        { label: "Humidity", value: Math.round(readings.weather.relative_humidity_2m).toString(), unit: "%", description: "Relative humidity", tone: "aqua" },
        { label: "Air pressure", value: Math.round(readings.weather.surface_pressure).toString(), unit: "hPa", description: "Local surface pressure", tone: "stone" },
        { label: "Noise", value: "—", description: "Calibrated local sensor needed", tone: "ink" },
        { label: "PM2.5", value: readings.air.pm2_5.toFixed(1), unit: "µg/m³", description: "Fine particulate matter", tone: "mint" },
        { label: "PM10", value: readings.air.pm10.toFixed(1), unit: "µg/m³", description: "Coarse particulate matter", tone: "sage" },
        { label: "Light intensity", value: Math.round(readings.weather.shortwave_radiation).toString(), unit: "W/m²", description: "Outdoor solar radiation", tone: "gold" },
      ]
    : [
        { label: "Temperature", value: "—", description: "Waiting for local conditions", tone: "sun" },
        { label: "Heat index", value: "—", description: "Waiting for local conditions", tone: "coral" },
        { label: "Wind speed", value: "—", description: "Waiting for local conditions", tone: "sky" },
        { label: "Wind direction", value: "—", description: "Waiting for local conditions", tone: "mist" },
        { label: "Humidity", value: "—", description: "Waiting for local conditions", tone: "aqua" },
        { label: "Air pressure", value: "—", description: "Waiting for local conditions", tone: "stone" },
        { label: "Noise", value: "—", description: "Calibrated local sensor needed", tone: "ink" },
        { label: "PM2.5", value: "—", description: "Waiting for local conditions", tone: "mint" },
        { label: "PM10", value: "—", description: "Waiting for local conditions", tone: "sage" },
        { label: "Light intensity", value: "—", description: "Waiting for local conditions", tone: "gold" },
      ];

  return (
    <main className="screen-grid" aria-label="Current environmental readings">
      {cards.map((card) => <Card card={card} key={card.label} />)}
    </main>
  );
}
