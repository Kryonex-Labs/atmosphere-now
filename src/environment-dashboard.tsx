import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AirCurrent,
  type DisplayCard,
  type Readings,
  fetchCpcbData,
  findNearestCpcbStation,
  windDirection,
} from "./api";
import LocationSearch from "./location-search";

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

// ponytail: +100 offset approximates SPL from dBFS; swap constant for a real calibration curve if accuracy matters
function useMicLevel() {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    let ctx: AudioContext | null = null;
    let interval: number | undefined;
    let stream: MediaStream | null = null;

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        interval = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;
          setLevel(Math.max(0, Math.round(dbfs + 100)));
        }, 1000);
      })
      .catch(() => undefined);

    return () => {
      if (interval) clearInterval(interval);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, []);

  return level;
}

export default function EnvironmentDashboard() {
  const [readings, setReadings] = useState<Readings | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    () => {
      const params = new URLSearchParams(window.location.search);
      const lat = parseFloat(params.get("lat") ?? "");
      const lon = parseFloat(params.get("lon") ?? "");
      return !isNaN(lat) && !isNaN(lon) ? { lat, lon } : null;
    },
  );
  const [placeName, setPlaceName] = useState(
    () => new URLSearchParams(window.location.search).get("place") ?? "",
  );
  const coordsRef = useRef(coords);
  const micLevel = useMicLevel();

  const loadReadings = useCallback(
    async (latitude: number, longitude: number) => {
      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
      weatherUrl.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,shortwave_radiation",
        timezone: "auto",
      }).toString();

      try {
        const [weatherResponse, cpcbRecords] = await Promise.all([
          fetch(weatherUrl),
          fetchCpcbData(),
        ]);
        if (!weatherResponse.ok) return;
        const weatherJson = await weatherResponse.json();

        const nearest = findNearestCpcbStation(
          cpcbRecords,
          latitude,
          longitude,
        );
        let airData: AirCurrent;

        if (nearest) {
          airData = {
            pm2_5: nearest.pm2_5,
            pm10: nearest.pm10,
            source: "cpcb",
            station: nearest.station,
          };
        } else {
          const airUrl = new URL(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
          );
          airUrl.search = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            current: "pm10,pm2_5",
            timezone: "auto",
          }).toString();
          const airResponse = await fetch(airUrl);
          if (!airResponse.ok) return;
          const airJson = await airResponse.json();
          airData = {
            pm2_5: airJson.current.pm2_5,
            pm10: airJson.current.pm10,
            source: "open-meteo",
          };
        }

        setReadings({ weather: weatherJson.current, air: airData });
      } catch {
        // Preserve the last successful display; this page is intended for unattended screens.
      }
    },
    [],
  );

  useEffect(() => {
    if (coordsRef.current) return;
    navigator.geolocation?.getCurrentPosition(
      ({ coords: c }) => {
        if (coordsRef.current) return;
        const loc = { lat: c.latitude, lon: c.longitude };
        coordsRef.current = loc;
        setCoords(loc);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    const initial = window.setTimeout(
      () => loadReadings(coords.lat, coords.lon),
      0,
    );
    const refresh = window.setInterval(
      () => loadReadings(coords.lat, coords.lon),
      60000,
    );
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
    };
  }, [coords, loadReadings]);

  const handleLocationSelect = useCallback(
    (lat: number, lon: number, name: string) => {
      const loc = { lat, lon };
      coordsRef.current = loc;
      setCoords(loc);
      const url = new URL(window.location.href);
      url.searchParams.set("lat", lat.toFixed(4));
      url.searchParams.set("lon", lon.toFixed(4));
      url.searchParams.set("place", name);
      history.replaceState(null, "", url);
      setPlaceName(name);
    },
    [],
  );

  const handleGeolocate = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(
      ({ coords: c }) => {
        const loc = { lat: c.latitude, lon: c.longitude };
        coordsRef.current = loc;
        setCoords(loc);
        const url = new URL(window.location.href);
        url.searchParams.delete("lat");
        url.searchParams.delete("lon");
        url.searchParams.delete("place");
        history.replaceState(null, "", url);
        setPlaceName("");
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }, []);

  const pmDesc = (label: string) => {
    if (!readings) return "Waiting for local conditions";
    if (readings.air.source === "cpcb")
      return placeName ? `${placeName} · ~2 km` : "Nearest station · ~2 km";
    return `${label === "PM2.5" ? "Fine" : "Coarse"} particulate · ~45 km grid`;
  };

  const cards: DisplayCard[] = readings
    ? [
        {
          label: "Temperature",
          value: Math.round(readings.weather.temperature_2m).toString(),
          unit: "°C",
          description: "Air at 2m · ~11 km grid",
          tone: "sun",
        },
        {
          label: "Heat index",
          value: Math.round(readings.weather.apparent_temperature).toString(),
          unit: "°C",
          description: "Feels-like · ~11 km grid",
          tone: "coral",
        },
        {
          label: "Wind speed",
          value: Math.round(readings.weather.wind_speed_10m).toString(),
          unit: "km/h",
          description: "At 10m · ~11 km grid",
          tone: "sky",
        },
        {
          label: "Wind direction",
          value: windDirection(readings.weather.wind_direction_10m),
          description: `${Math.round(readings.weather.wind_direction_10m)}° from north · ~11 km grid`,
          tone: "mist",
        },
        {
          label: "Humidity",
          value: Math.round(readings.weather.relative_humidity_2m).toString(),
          unit: "%",
          description: "Relative humidity · ~11 km grid",
          tone: "aqua",
        },
        {
          label: "Air pressure",
          value: Math.round(readings.weather.surface_pressure).toString(),
          unit: "hPa",
          description: "Surface pressure · ~11 km grid",
          tone: "stone",
        },
        {
          label: "Noise",
          value: micLevel !== null ? micLevel.toString() : "—",
          unit: micLevel !== null ? "~dB" : undefined,
          description:
            micLevel !== null ? "Device mic · 0 m" : "Microphone access needed",
          tone: "ink",
        },
        {
          label: "PM2.5",
          value: readings.air.pm2_5.toFixed(1),
          unit: "µg/m³",
          description: pmDesc("PM2.5"),
          tone: "mint",
        },
        {
          label: "PM10",
          value: readings.air.pm10.toFixed(1),
          unit: "µg/m³",
          description: pmDesc("PM10"),
          tone: "sage",
        },
        {
          label: "Light intensity",
          value: Math.round(readings.weather.shortwave_radiation).toString(),
          unit: "W/m²",
          description: "Solar radiation · ~11 km grid",
          tone: "gold",
        },
      ]
    : [
        {
          label: "Temperature",
          value: "—",
          description: "Waiting for local conditions",
          tone: "sun",
        },
        {
          label: "Heat index",
          value: "—",
          description: "Waiting for local conditions",
          tone: "coral",
        },
        {
          label: "Wind speed",
          value: "—",
          description: "Waiting for local conditions",
          tone: "sky",
        },
        {
          label: "Wind direction",
          value: "—",
          description: "Waiting for local conditions",
          tone: "mist",
        },
        {
          label: "Humidity",
          value: "—",
          description: "Waiting for local conditions",
          tone: "aqua",
        },
        {
          label: "Air pressure",
          value: "—",
          description: "Waiting for local conditions",
          tone: "stone",
        },
        {
          label: "Noise",
          value: micLevel !== null ? micLevel.toString() : "—",
          unit: micLevel !== null ? "~dB" : undefined,
          description:
            micLevel !== null ? "Device mic · 0 m" : "Microphone access needed",
          tone: "ink",
        },
        {
          label: "PM2.5",
          value: "—",
          description: "Waiting for local conditions",
          tone: "mint",
        },
        {
          label: "PM10",
          value: "—",
          description: "Waiting for local conditions",
          tone: "sage",
        },
        {
          label: "Light intensity",
          value: "—",
          description: "Waiting for local conditions",
          tone: "gold",
        },
      ];

  return (
    <>
      <nav className="top-bar">
        <h1 className="top-bar-title">Atmosphere Now</h1>
        <LocationSearch
          onSelect={handleLocationSelect}
          onGeolocate={handleGeolocate}
        />
      </nav>
      <main className="screen-grid" aria-label="Current environmental readings">
        {cards.map((card) => (
          <Card card={card} key={card.label} />
        ))}
      </main>
    </>
  );
}
