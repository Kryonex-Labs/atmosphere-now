"use client";

import {
  Activity,
  ArrowDown,
  CloudSun,
  Compass,
  Droplets,
  Gauge,
  Lightbulb,
  LocateFixed,
  MapPin,
  Mic2,
  RefreshCw,
  Sparkles,
  ThermometerSun,
  Wind,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WeatherCurrent = {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  surface_pressure: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  shortwave_radiation: number;
  weather_code: number;
  is_day: number;
};

type AirCurrent = {
  time: string;
  pm10: number;
  pm2_5: number;
  european_aqi: number;
};

type DashboardData = {
  weather: WeatherCurrent;
  air: AirCurrent;
  latitude: number;
  longitude: number;
  timezone: string;
};

type SensorConstructor = new () => {
  illuminance?: number;
  start: () => void;
  stop: () => void;
  addEventListener: (name: string, listener: () => void) => void;
};

const weatherDescriptions: Record<number, string> = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Storm with hail",
  99: "Storm with hail",
};

const windLabels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function windDirection(degrees: number) {
  return windLabels[Math.round(degrees / 45) % 8];
}

function airLabel(aqi: number) {
  if (aqi <= 20) return "Good";
  if (aqi <= 40) return "Fair";
  if (aqi <= 60) return "Moderate";
  if (aqi <= 80) return "Poor";
  if (aqi <= 100) return "Very poor";
  return "Extremely poor";
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? positive : negative}`;
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  detail,
  className = "",
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <article className={`metric-card ${className}`}>
      <div className="metric-heading">
        <span className="metric-icon" aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="metric-value-row">
        <strong className="metric-value">{value}</strong>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      <div className="metric-footer">
        <span>{detail}</span>
        {action}
      </div>
    </article>
  );
}

export default function EnvironmentDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<"locating" | "loading" | "ready" | "error">("locating");
  const [message, setMessage] = useState("Requesting your location…");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [noise, setNoise] = useState<number | null>(null);
  const [noiseStatus, setNoiseStatus] = useState<"idle" | "listening" | "unsupported" | "denied">("idle");
  const [sensorLux, setSensorLux] = useState<number | null>(null);
  const [lightStatus, setLightStatus] = useState<"idle" | "reading" | "unsupported" | "denied">("idle");
  const sensorRef = useRef<InstanceType<SensorConstructor> | null>(null);

  const loadAtPosition = useCallback(async (latitude: number, longitude: number) => {
    setStatus("loading");
    setMessage("Reading the atmosphere…");

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "surface_pressure",
        "wind_speed_10m",
        "wind_direction_10m",
        "shortwave_radiation",
        "weather_code",
        "is_day",
      ].join(","),
      timezone: "auto",
    }).toString();

    const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    airUrl.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "pm10,pm2_5,european_aqi",
      timezone: "auto",
    }).toString();

    try {
      const [weatherResponse, airResponse] = await Promise.all([
        fetch(weatherUrl),
        fetch(airUrl),
      ]);

      if (!weatherResponse.ok || !airResponse.ok) {
        throw new Error("The environmental services did not respond.");
      }

      const weatherJson = await weatherResponse.json();
      const airJson = await airResponse.json();

      setData({
        weather: weatherJson.current,
        air: airJson.current,
        latitude,
        longitude,
        timezone: weatherJson.timezone_abbreviation || weatherJson.timezone || "Local time",
      });
      setLastUpdated(new Date());
      setStatus("ready");
      setMessage("Live conditions");
    } catch {
      setStatus("error");
      setMessage("We couldn’t load environmental data. Check your connection and try again.");
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Location is not supported by this browser.");
      return;
    }

    setStatus("locating");
    setMessage("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => loadAtPosition(coords.latitude, coords.longitude),
      (error) => {
        setStatus("error");
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location access is off. Allow it in your browser to see local conditions."
            : "Your location couldn’t be determined. Try again in a moment.",
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }, [loadAtPosition]);

  useEffect(() => {
    const locationRequest = window.setTimeout(requestLocation, 0);
    return () => {
      window.clearTimeout(locationRequest);
      sensorRef.current?.stop();
    };
  }, [requestLocation]);

  const measureNoise = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNoiseStatus("unsupported");
      return;
    }

    setNoiseStatus("listening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const readings: number[] = [];

      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const sample = () => {
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          if (rms > 0) readings.push(20 * Math.log10(rms));
          if (performance.now() - startedAt < 2200) requestAnimationFrame(sample);
          else resolve();
        };
        sample();
      });

      stream.getTracks().forEach((track) => track.stop());
      await context.close();
      setNoise(readings.length ? Math.round(readings.reduce((sum, value) => sum + value, 0) / readings.length) : -100);
      setNoiseStatus("idle");
    } catch {
      setNoiseStatus("denied");
    }
  };

  const readLightSensor = () => {
    const Sensor = (window as unknown as { AmbientLightSensor?: SensorConstructor }).AmbientLightSensor;
    if (!Sensor) {
      setLightStatus("unsupported");
      return;
    }

    try {
      setLightStatus("reading");
      const sensor = new Sensor();
      sensorRef.current = sensor;
      sensor.addEventListener("reading", () => {
        if (typeof sensor.illuminance === "number") {
          setSensorLux(Math.round(sensor.illuminance));
          setLightStatus("idle");
          sensor.stop();
        }
      });
      sensor.addEventListener("error", () => setLightStatus("denied"));
      sensor.start();
    } catch {
      setLightStatus("denied");
    }
  };

  const locationLabel = data
    ? `${formatCoordinate(data.latitude, "N", "S")} · ${formatCoordinate(data.longitude, "E", "W")}`
    : "Waiting for coordinates";

  const lightValue = useMemo(() => {
    if (sensorLux !== null) return { value: sensorLux.toLocaleString(), unit: "lux", detail: "From this device’s light sensor" };
    if (data) return {
      value: Math.round(data.weather.shortwave_radiation * 120).toLocaleString(),
      unit: "lux*",
      detail: "Outdoor daylight estimate",
    };
    return { value: "—", unit: "lux", detail: "Waiting for local conditions" };
  }, [data, sensorLux]);

  if (!data && status !== "ready") {
    return (
      <main className="state-page">
        <div className="brand-mark" aria-hidden="true"><Sparkles size={18} /></div>
        <p className="eyebrow">Atmosphere now</p>
        <h1>Your surroundings,<br />made visible.</h1>
        <p className="state-message">{message}</p>
        {status === "error" ? (
          <button className="primary-button" onClick={requestLocation} type="button">
            <LocateFixed size={18} /> Try location again
          </button>
        ) : (
          <div className="loading-line" aria-label="Loading"><span /></div>
        )}
        <p className="privacy-note">Your coordinates are used only to request nearby conditions. They are not stored.</p>
      </main>
    );
  }

  if (!data) return null;

  const weather = data.weather;
  const air = data.air;
  const weatherDescription = weatherDescriptions[weather.weather_code] || "Current conditions";
  const aqiLabel = airLabel(air.european_aqi);

  return (
    <main className={`dashboard ${weather.is_day ? "day" : "night"}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Atmosphere Now home">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>Atmosphere <em>Now</em></span>
        </a>
        <div className="topbar-actions">
          <span className="live-badge"><i /> Live</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh local conditions"
            onClick={() => loadAtPosition(data.latitude, data.longitude)}
            disabled={status === "loading"}
          >
            <RefreshCw size={18} className={status === "loading" ? "spinning" : ""} />
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><MapPin size={14} /> Right where you are</p>
          <h1>The air around you,<br /><span>at a glance.</span></h1>
          <p className="hero-description">
            A live environmental snapshot from open weather models and the sensors available on your device.
          </p>
        </div>

        <div className="temperature-panel">
          <div className="weather-note">
            <CloudSun size={20} /> {weatherDescription}
          </div>
          <div className="temperature-reading">
            <strong>{Math.round(weather.temperature_2m)}</strong><sup>°C</sup>
          </div>
          <div className="feels-like">
            <span>Feels like</span>
            <strong>{Math.round(weather.apparent_temperature)}°</strong>
          </div>
          <div className="sun-orbit" aria-hidden="true"><span /></div>
        </div>
      </section>

      <section className="location-strip" aria-label="Location and update time">
        <div><MapPin size={17} /><span>{locationLabel}</span></div>
        <div>
          <span>Updated {lastUpdated?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="timezone">{data.timezone}</span>
        </div>
      </section>

      <section className="metrics-section" aria-labelledby="conditions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live readings</p>
            <h2 id="conditions-title">Current conditions</h2>
          </div>
          <p>Weather and air-quality values are modelled for the closest available grid cell.</p>
        </div>

        <div className="metric-grid">
          <MetricCard
            icon={<ThermometerSun size={21} />}
            label="Heat index"
            value={Math.round(weather.apparent_temperature).toString()}
            unit="°C"
            detail={`Air temperature ${Math.round(weather.temperature_2m)}°C`}
            className="coral-card"
          />
          <MetricCard
            icon={<Wind size={21} />}
            label="Wind speed"
            value={Math.round(weather.wind_speed_10m).toString()}
            unit="km/h"
            detail="Measured at 10 metres"
          />
          <MetricCard
            icon={<Compass size={21} />}
            label="Wind direction"
            value={windDirection(weather.wind_direction_10m)}
            detail={`${Math.round(weather.wind_direction_10m)}° from north`}
            action={<ArrowDown className="wind-arrow" size={20} style={{ transform: `rotate(${weather.wind_direction_10m}deg)` }} />}
          />
          <MetricCard
            icon={<Droplets size={21} />}
            label="Humidity"
            value={Math.round(weather.relative_humidity_2m).toString()}
            unit="%"
            detail="Relative humidity"
            className="blue-card"
          />
          <MetricCard
            icon={<Gauge size={21} />}
            label="Atmospheric pressure"
            value={Math.round(weather.surface_pressure).toLocaleString()}
            unit="hPa"
            detail="Local surface pressure"
          />
          <MetricCard
            icon={<Activity size={21} />}
            label="PM2.5"
            value={air.pm2_5.toFixed(1)}
            unit="µg/m³"
            detail={`Air quality: ${aqiLabel}`}
            className="mint-card"
          />
          <MetricCard
            icon={<Activity size={21} />}
            label="PM10"
            value={air.pm10.toFixed(1)}
            unit="µg/m³"
            detail={`European AQI ${Math.round(air.european_aqi)}`}
          />
          <MetricCard
            icon={<Mic2 size={21} />}
            label="Noise"
            value={noise === null ? "—" : noise.toString()}
            unit={noise === null ? undefined : "dBFS"}
            detail={
              noiseStatus === "listening" ? "Listening for 2 seconds…" :
              noiseStatus === "denied" ? "Microphone access was not allowed" :
              noiseStatus === "unsupported" ? "Microphone not available" :
              noise === null ? "Requires your device microphone" : "Relative level · not calibrated dBA"
            }
            action={
              <button className="text-button" type="button" onClick={measureNoise} disabled={noiseStatus === "listening"}>
                {noiseStatus === "listening" ? "Measuring" : noise === null ? "Measure" : "Again"}
              </button>
            }
            className="dark-card"
          />
          <MetricCard
            icon={<Lightbulb size={21} />}
            label="Light intensity"
            value={lightValue.value}
            unit={lightValue.unit}
            detail={lightStatus === "denied" ? "Light sensor access was blocked" : lightValue.detail}
            action={
              sensorLux === null ? (
                <button className="text-button" type="button" onClick={readLightSensor} disabled={lightStatus === "reading"}>
                  {lightStatus === "reading" ? "Reading" : lightStatus === "unsupported" ? "No sensor" : "Use sensor"}
                </button>
              ) : undefined
            }
            className="yellow-card"
          />
        </div>
      </section>

      <section className="source-note" aria-labelledby="source-title">
        <div className="source-index">01</div>
        <div>
          <p className="eyebrow">About these readings</p>
          <h2 id="source-title">Open data, with honest limits.</h2>
        </div>
        <p>
          Temperature, wind, humidity, pressure, daylight and particulates come from Open-Meteo. Noise is measured locally only after you allow the microphone. The daylight lux value is an approximate conversion from modelled solar radiation unless your browser exposes a light sensor.
        </p>
      </section>

      <footer>
        <span>Atmosphere Now</span>
        <span>Powered by Open-Meteo · No API key required</span>
      </footer>
    </main>
  );
}
