import { useEffect, useRef, useState } from "react";

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

function locationLabel(p: PhotonFeature["properties"]): string {
  return [p.name, p.city, p.state, p.country].filter(Boolean).join(", ");
}

export default function LocationSearch({
  onSelect,
  onGeolocate,
}: {
  onSelect: (lat: number, lon: number, name: string) => void;
  onGeolocate: () => void;
}) {
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("place") ?? "",
  );
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(0);

  useEffect(() => {
    if (query.length < 2) return;
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
        );
        if (!res.ok) return;
        const json = await res.json();
        setResults(json.features ?? []);
      } catch {
        /* noop */
      }
    }, 350);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  return (
    <div
      className="location-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className="location-bar">
        <input
          type="text"
          placeholder="Search location..."
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (val.length < 2) setResults([]);
            setOpen(true);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        <button
          className="geo-btn"
          onClick={() => {
            onGeolocate();
            setQuery("");
          }}
          title="Use my location"
          aria-label="Use my location"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
          </svg>
        </button>
      </div>
      {open && results.length > 0 && (
        <ul className="location-results">
          {results.map((f, i) => (
            <li key={i}>
              <button
                onClick={() => {
                  const [lon, lat] = f.geometry.coordinates;
                  const name = locationLabel(f.properties);
                  onSelect(lat, lon, name);
                  setQuery(name);
                  setOpen(false);
                  setResults([]);
                }}
              >
                {locationLabel(f.properties)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
