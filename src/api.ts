export type WeatherCurrent = {
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  surface_pressure: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  shortwave_radiation: number;
};

export type AirCurrent = {
  pm10: number;
  pm2_5: number;
  source: "cpcb" | "open-meteo";
  station?: string;
};

export type Readings = {
  weather: WeatherCurrent;
  air: AirCurrent;
};

export type DisplayCard = {
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
const CPCB_URL =
  "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";

let cpcbCache: CpcbRecord[] | null = null;

export async function fetchCpcbData(): Promise<CpcbRecord[]> {
  if (cpcbCache) return cpcbCache;
  try {
    const res = await fetch(
      `${CPCB_URL}?api-key=${CPCB_KEY}&format=json&limit=5000`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    const records: CpcbRecord[] = json.records ?? [];
    cpcbCache = records;
    return records;
  } catch {
    return [];
  }
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestCpcbStation(
  records: CpcbRecord[],
  lat: number,
  lon: number,
) {
  const stations = new Map<
    string,
    { lat: number; lon: number; pollutants: Map<string, number> }
  >();
  for (const r of records) {
    if (!stations.has(r.station)) {
      stations.set(r.station, {
        lat: parseFloat(r.latitude),
        lon: parseFloat(r.longitude),
        pollutants: new Map(),
      });
    }
    if (r.avg_value !== "NA") {
      stations
        .get(r.station)!
        .pollutants.set(r.pollutant_id, parseFloat(r.avg_value));
    }
  }

  let best: {
    station: string;
    pm2_5: number;
    pm10: number;
    dist: number;
  } | null = null;
  for (const [name, data] of stations) {
    const pm25 = data.pollutants.get("PM2.5");
    const pm10 = data.pollutants.get("PM10");
    if (pm25 === undefined || pm10 === undefined) continue;
    const dist = haversineKm(lat, lon, data.lat, data.lon);
    if (dist > 50) continue;
    if (!best || dist < best.dist)
      best = { station: name, pm2_5: pm25, pm10: pm10, dist };
  }
  return best;
}

const windLabels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function windDirection(degrees: number) {
  return windLabels[Math.round(degrees / 45) % 8];
}
