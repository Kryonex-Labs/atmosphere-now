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
  source: "cpcb" | "open-meteo";
  station?: string;
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

type CpcbRecord = {
  station: string;
  latitude: string;
  longitude: string;
  pollutant_id: string;
  avg_value: string;
};

const CPCB_KEY = "579b464db66ec23bdd000001384fd6286c8f44644488e8c067103e61";
const CPCB_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";

let cpcbCache: CpcbRecord[] | null = null;

async function fetchCpcbData(): Promise<CpcbRecord[]> {
  if (cpcbCache) return cpcbCache;
  try {
    const res = await fetch(`${CPCB_URL}?api-key=${CPCB_KEY}&format=json&limit=5000`);
    if (!res.ok) return [];
    const json = await res.json();
    const records: CpcbRecord[] = json.records ?? [];
    cpcbCache = records;
    return records;
  } catch {
    return [];
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestCpcbStation(records: CpcbRecord[], lat: number, lon: number) {
  const stations = new Map<string, { lat: number; lon: number; pollutants: Map<string, number> }>();
  for (const r of records) {
    if (!stations.has(r.station)) {
      stations.set(r.station, { lat: parseFloat(r.latitude), lon: parseFloat(r.longitude), pollutants: new Map() });
    }
    if (r.avg_value !== "NA") {
      stations.get(r.station)!.pollutants.set(r.pollutant_id, parseFloat(r.avg_value));
    }
  }

  let best: { station: string; pm2_5: number; pm10: number; dist: number } | null = null;
  for (const [name, data] of stations) {
    const pm25 = data.pollutants.get("PM2.5");
    const pm10 = data.pollutants.get("PM10");
    if (pm25 === undefined || pm10 === undefined) continue;
    const dist = haversineKm(lat, lon, data.lat, data.lon);
    if (dist > 50) continue;
    if (!best || dist < best.dist) best = { station: name, pm2_5: pm25, pm10: pm10, dist };
  }
  return best;
}

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

// ponytail: +100 offset approximates SPL from dBFS; swap constant for a real calibration curve if accuracy matters
function useMicLevel() {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    let ctx: AudioContext | null = null;
    let interval: number | undefined;
    let stream: MediaStream | null = null;

    navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => {
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
    }).catch(() => undefined);

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
  const micLevel = useMicLevel();

  const loadReadings = useCallback(async (latitude: number, longitude: number) => {
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,shortwave_radiation",
      timezone: "auto",
    }).toString();

    try {
      const [weatherResponse, cpcbRecords] = await Promise.all([fetch(weatherUrl), fetchCpcbData()]);
      if (!weatherResponse.ok) return;
      const weatherJson = await weatherResponse.json();

      const nearest = findNearestCpcbStation(cpcbRecords, latitude, longitude);
      let airData: AirCurrent;

      if (nearest) {
        airData = { pm2_5: nearest.pm2_5, pm10: nearest.pm10, source: "cpcb", station: nearest.station };
      } else {
        const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
        airUrl.search = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          current: "pm10,pm2_5",
          timezone: "auto",
        }).toString();
        const airResponse = await fetch(airUrl);
        if (!airResponse.ok) return;
        const airJson = await airResponse.json();
        airData = { pm2_5: airJson.current.pm2_5, pm10: airJson.current.pm10, source: "open-meteo" };
      }

      setReadings({ weather: weatherJson.current, air: airData });
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

  const pmDesc = (label: string) => {
    if (!readings) return "Waiting for local conditions";
    if (readings.air.source === "cpcb") return `${readings.air.station} · ~2 km`;
    return `${label === "PM2.5" ? "Fine" : "Coarse"} particulate · ~45 km grid`;
  };

  const cards: DisplayCard[] = readings
    ? [
        { label: "Temperature", value: Math.round(readings.weather.temperature_2m).toString(), unit: "°C", description: "Air at 2m · ~11 km grid", tone: "sun" },
        { label: "Heat index", value: Math.round(readings.weather.apparent_temperature).toString(), unit: "°C", description: "Feels-like · ~11 km grid", tone: "coral" },
        { label: "Wind speed", value: Math.round(readings.weather.wind_speed_10m).toString(), unit: "km/h", description: "At 10m · ~11 km grid", tone: "sky" },
        { label: "Wind direction", value: windDirection(readings.weather.wind_direction_10m), description: `${Math.round(readings.weather.wind_direction_10m)}° from north · ~11 km grid`, tone: "mist" },
        { label: "Humidity", value: Math.round(readings.weather.relative_humidity_2m).toString(), unit: "%", description: "Relative humidity · ~11 km grid", tone: "aqua" },
        { label: "Air pressure", value: Math.round(readings.weather.surface_pressure).toString(), unit: "hPa", description: "Surface pressure · ~11 km grid", tone: "stone" },
        { label: "Noise", value: micLevel !== null ? micLevel.toString() : "—", unit: micLevel !== null ? "~dB" : undefined, description: micLevel !== null ? "Device mic · 0 m" : "Microphone access needed", tone: "ink" },
        { label: "PM2.5", value: readings.air.pm2_5.toFixed(1), unit: "µg/m³", description: pmDesc("PM2.5"), tone: "mint" },
        { label: "PM10", value: readings.air.pm10.toFixed(1), unit: "µg/m³", description: pmDesc("PM10"), tone: "sage" },
        { label: "Light intensity", value: Math.round(readings.weather.shortwave_radiation).toString(), unit: "W/m²", description: "Solar radiation · ~11 km grid", tone: "gold" },
      ]
    : [
        { label: "Temperature", value: "—", description: "Waiting for local conditions", tone: "sun" },
        { label: "Heat index", value: "—", description: "Waiting for local conditions", tone: "coral" },
        { label: "Wind speed", value: "—", description: "Waiting for local conditions", tone: "sky" },
        { label: "Wind direction", value: "—", description: "Waiting for local conditions", tone: "mist" },
        { label: "Humidity", value: "—", description: "Waiting for local conditions", tone: "aqua" },
        { label: "Air pressure", value: "—", description: "Waiting for local conditions", tone: "stone" },
        { label: "Noise", value: micLevel !== null ? micLevel.toString() : "—", unit: micLevel !== null ? "~dB" : undefined, description: micLevel !== null ? "Device mic · 0 m" : "Microphone access needed", tone: "ink" },
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
