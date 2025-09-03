import React, { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import axios from "axios";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const GEO_KEY = import.meta.env.VITE_GEOAPIFY_KEY;
const OWM_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || null;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const hotelIcon = new L.Icon({
  iconUrl:
    "https://cdn.jsdelivr.net/gh/encharm/Font-Awesome-SVG-PNG@master/svgs/solid/hotel.svg",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

const icons = {
  car: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/743/743988.png",
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  }),
  bike: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854894.png",
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  }),
  flight: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/681/681392.png",
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  }),
  walk: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/1946/1946429.png",
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  }),
};

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points || points.length === 0) return;
    try {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
    } catch {}
  }, [points, map]);
  return null;
}

function MovingPerson({ route, mode }) {
  const map = useMap();
  const markerRef = useRef(null);

  useEffect(() => {
    if (!route || route.length === 0) return;
    let i = 0;

    if (markerRef.current) {
      map.removeLayer(markerRef.current);
    }

    const icon =
      mode === "car"
        ? icons.car
        : mode === "bike"
        ? icons.bike
        : mode === "flight"
        ? icons.flight
        : icons.walk;

    markerRef.current = L.marker(route[0], { icon }).addTo(map);

    const speed =
      mode === "flight" ? 50 : mode === "car" ? 150 : mode === "bike" ? 300 : 500;

    const interval = setInterval(() => {
      if (i < route.length) {
        markerRef.current.setLatLng(route[i]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [route, mode, map]);

  return null;
}

function PlaceInput({ label, value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef();

  useEffect(() => {
    if (!value || value.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get("https://api.geoapify.com/v1/geocode/autocomplete", {
          params: { text: value, limit: 6, apiKey: GEO_KEY },
        });
        const features = Array.isArray(res.data?.features) ? res.data.features : [];
        const items = features
          .map((f) => ({
            lat: f.geometry?.coordinates?.[1],
            lon: f.geometry?.coordinates?.[0],
            display: f.properties?.formatted || "",
            raw: f,
          }))
          .filter((it) => it.lat != null && it.lon != null);
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  return (
    <div className="relative w-full">
      <label className="block text-xs text-gray-400 mb-1 tracking-wide">{label}</label>
      <input
        className="w-full px-3 py-2 bg-white/80 backdrop-blur border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition hover:shadow-md"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value && value.length >= 2 && setOpen(suggestions.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={label}
        aria-label={label}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full bg-white/95 backdrop-blur border rounded-xl shadow-lg max-h-56 overflow-auto text-sm">
          {suggestions.map((s, i) => (
            <li
              key={`${s.lat}-${s.lon}-${i}`}
              onMouseDown={() => {
                onSelect({ lat: s.lat, lon: s.lon, display: s.display, raw: s.raw });
                setOpen(false);
              }}
              className="px-3 py-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100 cursor-pointer transition"
            >
              {s.display}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const mapRef = useRef(null);
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [origin, setOrigin] = useState(null);
  const [dest, setDest] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [route, setRoute] = useState([]);
  const [summary, setSummary] = useState(null);
  const [hotels, setHotels] = useState([]);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [routeType, setRouteType] = useState("car");

  const geocodeText = async (text) => {
    if (!text || !text.trim()) return null;
    try {
      const res = await axios.get("https://api.geoapify.com/v1/geocode/search", {
        params: { text, limit: 1, apiKey: GEO_KEY },
      });
      const f = Array.isArray(res.data?.features) ? res.data.features[0] : null;
      if (!f) return null;
      const lat = f.geometry?.coordinates?.[1];
      const lon = f.geometry?.coordinates?.[0];
      if (lat == null || lon == null) return null;
      return { lat, lon, display: f.properties?.formatted || "", raw: f };
    } catch {
      return null;
    }
  };

  const fetchRoute = async (places, mode) => {
    if (!places || places.length < 2) throw new Error("Need >=2 points to route");
    const coords = places.map((p) => `${p.lon},${p.lat}`).join(";");

    const straightLineDistance = places.reduce((acc, curr, i) => {
      if (i === 0) return 0;
      const prev = places[i - 1];
      const d = Math.sqrt(
        Math.pow(curr.lat - prev.lat, 2) + Math.pow(curr.lon - prev.lon, 2)
      ) * 111;
      return acc + d;
    }, 0);

    if (mode === "flight") {
      const routeCoords = places.map((p) => [p.lat, p.lon]);
      const flightSpeed = 800;
      const duration = straightLineDistance / flightSpeed;
      return {
        coords: routeCoords,
        summary: {
          distance: straightLineDistance.toFixed(1),
          duration: duration.toFixed(1),
        },
      };
    }

    const profile = mode === "bike" ? "cycling" : "driving";
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson`;
    try {
      const res = await axios.get(url);
      const routeData = res.data?.routes?.[0];
      if (!routeData || !routeData.geometry || !Array.isArray(routeData.geometry.coordinates))
        throw new Error("Route not available");
      const routeCoords = routeData.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

      let duration = typeof routeData.duration === "number" ? routeData.duration / 3600 : 0;
      const distance = typeof routeData.distance === "number" ? routeData.distance / 1000 : 0;

      if (mode === "bike") {
        const bikeSpeed = 30;
        duration = distance / bikeSpeed;
      }

      return {
        coords: routeCoords,
        summary: { distance: distance.toFixed(1), duration: duration.toFixed(1) },
      };
    } catch {
      const routeCoords = places.map((p) => [p.lat, p.lon]);
      const speed = mode === "bike" ? 20 : 60;
      const duration = straightLineDistance / speed;
      return {
        coords: routeCoords,
        summary: {
          distance: straightLineDistance.toFixed(1),
          duration: duration.toFixed(1),
        },
      };
    }
  };

  const fetchHotels = async (lat, lon) => {
    try {
      const res = await axios.get("https://api.geoapify.com/v2/places", {
        params: {
          categories: "accommodation.hotel",
          filter: `circle:${lon},${lat},5000`,
          limit: 10,
          apiKey: GEO_KEY,
        },
      });
      const features = Array.isArray(res.data?.features) ? res.data.features : [];
      return features
        .map((f) => {
          const coords = f.geometry?.coordinates || [];
          const latF = coords[1];
          const lonF = coords[0];
          if (latF == null || lonF == null) return null;
          return {
            id: f.properties?.place_id || f.properties?.osm_id || `${latF},${lonF}`,
            name: f.properties?.name || "Unnamed Hotel",
            address: f.properties?.address_line2 || f.properties?.formatted || "",
            lat: latF,
            lon: lonF,
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  const fetchWeatherFor = async (lat, lon) => {
    if (!OWM_KEY) return null;
    try {
      const res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
        params: { lat, lon, units: "metric", appid: OWM_KEY },
      });
      return res.data || null;
    } catch {
      return null;
    }
  };

  const fetchForecastFor = async (lat, lon) => {
    if (!OWM_KEY) return [];
    try {
      const res = await axios.get("https://api.openweathermap.org/data/2.5/forecast", {
        params: { lat, lon, units: "metric", appid: OWM_KEY },
      });
      const list = Array.isArray(res.data?.list) ? res.data.list : [];
      const days = [];
      for (let i = 0; i < list.length && days.length < 5; i++) {
        const it = list[i];
        const date = it.dt_txt?.split(" ")?.[0];
        if (!date) continue;
        if (!days.find((d) => d.date === date)) {
          days.push({
            date,
            temp: Math.round(it.main?.temp || 0),
            desc: it.weather?.[0]?.description || "",
          });
        }
      }
      return days;
    } catch {
      return [];
    }
  };

  const planTrip = async () => {
    setError("");
    setLoading(true);
    try {
      let o = origin;
      let d = dest;
      if (!o && originText) {
        o = await geocodeText(originText);
        if (!o) throw new Error("Origin not found");
        setOrigin(o);
      }
      if (!d && destText) {
        d = await geocodeText(destText);
        if (!d) throw new Error("Destination not found");
        setDest(d);
      }
      if (!o || !d) throw new Error("Select origin and destination (or type them)");

      const resolvedWaypoints = waypoints.map((w) => ({ ...w }));
      for (let i = 0; i < resolvedWaypoints.length; i++) {
        if (!resolvedWaypoints[i].place && resolvedWaypoints[i].text) {
          const gp = await geocodeText(resolvedWaypoints[i].text);
          if (gp) resolvedWaypoints[i].place = gp;
        }
      }
      setWaypoints(resolvedWaypoints);

      const points = [o, ...resolvedWaypoints.map((w) => w.place).filter(Boolean), d];
      if (points.length < 2) throw new Error("Need at least origin and destination");

      const { coords, summary: sum } = await fetchRoute(points, routeType);
      setRoute(coords || []);
      setSummary(sum || null);

      const hotelsRes = await fetchHotels(d.lat, d.lon);
      setHotels(hotelsRes);

      const w = await fetchWeatherFor(d.lat, d.lon);
      setWeather(w);
      await fetchForecastFor(d.lat, d.lon);

      if (mapRef.current && d) {
        try {
          mapRef.current.setView([d.lat, d.lon], 8);
        } catch {}
      }
    } catch (err) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const addWaypoint = () => setWaypoints((s) => [...s, { text: "", place: null }]);
  const removeWaypoint = (i) => setWaypoints((s) => s.filter((_, idx) => idx !== i));

  const viewHotelOnMap = (h) => {
    if (!mapRef.current || !h) return;
    try {
      mapRef.current.setView([h.lat, h.lon], 15);
    } catch {}
  };

  const center = dest ? [dest.lat, dest.lon] : [20.5937, 78.9629];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Helmet>
        <html lang="en" />
        <title>Travel Planner | Routes, Hotels & Weather</title>
        <meta
          name="description"
          content="Plan trips with optimized routes, find nearby hotels, and check weather forecasts using our interactive Travel Planner."
        />
        <link rel="canonical" href="https://yourdomain.com/" />
        <meta property="og:title" content="Travel Planner" />
        <meta
          property="og:description"
          content="Plan trips with routes, hotels & weather in one place."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://yourdomain.com/" />
        <meta property="og:image" content="https://yourdomain.com/preview.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Travel Planner" />
        <meta
          name="twitter:description"
          content="Plan your journey with routes, hotels, and weather updates."
        />
        <meta
          name="twitter:image"
          content="https://yourdomain.com/preview.png"
        />
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "TravelAgency",
            "name": "Travel Planner",
            "url": "https://yourdomain.com",
            "description": "Plan trips with routes, hotels and weather info.",
            "logo": "https://yourdomain.com/logo.png"
          }
        `}</script>
        <link rel="preconnect" href="https://api.geoapify.com" />
        <link rel="preconnect" href="https://tile.openstreetmap.org" />
      </Helmet>

      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-wide">Travel Planner</h1>
            <p className="text-xs opacity-80">Routes • Hotels • Weather</p>
          </div>
          <div className="text-xs opacity-70">Geoapify key required in .env</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg space-y-3 transition hover:shadow-xl">
            <div className="text-sm font-semibold text-gray-700">Plan your trip</div>
            <PlaceInput
              label="Origin"
              value={originText}
              onChange={(v) => {
                setOriginText(v);
                setOrigin(null);
              }}
              onSelect={(p) => {
                setOrigin(p);
                setOriginText(p.display || "");
              }}
            />
            <div className="space-y-2">
              {waypoints.map((wp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <PlaceInput
                      label={`Stop ${i + 1}`}
                      value={wp.text}
                      onChange={(v) => {
                        const copy = [...waypoints];
                        copy[i].text = v;
                        copy[i].place = null;
                        setWaypoints(copy);
                      }}
                      onSelect={(p) => {
                        const copy = [...waypoints];
                        copy[i] = { text: p.display || "", place: p };
                        setWaypoints(copy);
                      }}
                    />
                  </div>
                  <button
                    onClick={() => removeWaypoint(i)}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition"
                    title="Remove stop"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <PlaceInput
              label="Destination"
              value={destText}
              onChange={(v) => {
                setDestText(v);
                setDest(null);
              }}
              onSelect={(p) => {
                setDest(p);
                setDestText(p.display || "");
              }}
            />
            <div className="w-full">
              <label className="block text-xs text-gray-400 mb-1 tracking-wide">
                Travel Mode
              </label>
              <select
                value={routeType}
                onChange={(e) => setRouteType(e.target.value)}
                className="w-full px-3 py-2 bg-white/80 backdrop-blur border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition hover:shadow-md"
              >
                <option value="car">Car</option>
                <option value="bike">Bike</option>
                <option value="flight">Flight</option>
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={addWaypoint}
                className="flex-1 bg-white border border-gray-200 text-sm px-4 py-2 rounded-xl hover:shadow transition"
              >
                + Add Stop
              </button>
              <button
                onClick={planTrip}
                disabled={loading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium shadow hover:shadow-lg transition disabled:opacity-60"
              >
                {loading ? "Planning..." : "Plan Trip"}
              </button>
            </div>
            {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
          </div>
          <div className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg hover:shadow-xl transition">
            <div className="text-sm font-semibold text-gray-700">Summary</div>
            {summary ? (
              <div className="mt-2 text-sm space-y-1">
                <div>
                  {routeType === "flight"
                    ? "✈️"
                    : routeType === "bike"
                    ? "🚲"
                    : "🚗"}{" "}
                  Distance: <strong>{summary.distance} km</strong>
                </div>
                <div>
                  ⏱ Duration: <strong>{summary.duration} hrs</strong>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-400">No route yet</div>
            )}
          </div>
          <div className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg hover:shadow-xl transition">
            <div className="text-sm font-semibold text-gray-700">
              Weather (destination)
            </div>
            {weather ? (
              <div className="mt-2 text-sm">
                <div className="text-lg font-bold">
                  {Math.round(weather.main?.temp || 0)}°C
                </div>
                <div className="capitalize text-gray-500">
                  {weather.weather?.[0]?.description || ""}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-400">
                {OWM_KEY
                  ? "No data yet."
                  : "Set VITE_OPENWEATHER_API_KEY to enable weather."}
              </div>
            )}
          </div>
          <div className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg hover:shadow-xl transition">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-700">
                Nearby Hotels
              </div>
              <div className="text-xs text-gray-400">{hotels.length} found</div>
            </div>
            <div className="mt-3 space-y-2 max-h-64 overflow-auto pr-1">
              {hotels.length === 0 ? (
                <div className="text-xs text-gray-400">
                  No hotels yet — plan trip to load.
                </div>
              ) : (
                hotels.map((h) => (
                  <div
                    key={h.id}
                    className="border p-2 rounded-lg flex items-start justify-between bg-white/80"
                  >
                    <div>
                      <div className="text-sm font-medium">{h.name}</div>
                      <div className="text-xs text-gray-500">{h.address}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => viewHotelOnMap(h)}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
        <section className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <MapContainer
              center={center}
              zoom={5}
              style={{ height: "560px", width: "100%" }}
              whenCreated={(map) => (mapRef.current = map)}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {origin && (
                <Marker position={[origin.lat, origin.lon]}>
                  <Popup>{origin.display}</Popup>
                </Marker>
              )}
              {waypoints.map(
                (w, i) =>
                  w.place && (
                    <Marker
                      key={`wp-${i}`}
                      position={[w.place.lat, w.place.lon]}
                    >
                      <Popup>{w.place.display || `Stop ${i + 1}`}</Popup>
                    </Marker>
                  )
              )}
              {dest && (
                <Marker position={[dest.lat, dest.lon]}>
                  <Popup>{dest.display}</Popup>
                </Marker>
              )}
              {route && route.length > 0 && (
                <Polyline
                  positions={route}
                  pathOptions={{
                    color: routeType === "flight" ? "#FF0000" : "#2563EB",
                  }}
                />
              )}
              {route && route.length > 0 && (
                <MovingPerson route={route} mode={routeType} />
              )}
              {hotels.map((h) => (
                <Marker
                  key={`hotel-${h.id}`}
                  position={[h.lat, h.lon]}
                  icon={hotelIcon}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-medium">🏨 {h.name}</div>
                      <div className="text-xs text-gray-600">{h.address}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              <FitBounds
                points={[
                  ...(route || []),
                  ...(origin ? [[origin.lat, origin.lon]] : []),
                  ...(dest ? [[dest.lat, dest.lon]] : []),
                ]}
              />
            </MapContainer>
          </div>
        </section>
      </main>
    </div>
  );
}
