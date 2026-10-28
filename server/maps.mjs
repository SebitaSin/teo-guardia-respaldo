import { existsSync, readFileSync } from "node:fs";

function valueFromEnvOrFile(env, valueName, fileName) {
  const direct = String(env[valueName] ?? "").trim();
  if (direct) return direct;
  const path = String(env[fileName] ?? "").trim();
  if (!path || !existsSync(path)) return "";
  try { return readFileSync(path, "utf8").trim(); } catch { return ""; }
}

export function mapsConfig(env = process.env) {
  return {
    // Use distinct browser and server keys with compatible restrictions. The browser
    // value is returned only to load Maps JavaScript; the server value never
    // leaves this process and is used for Geocoding/Routes proxy calls.
    browserKey: valueFromEnvOrFile(env, "GOOGLE_MAPS_BROWSER_KEY", "GOOGLE_MAPS_BROWSER_KEY_FILE") || valueFromEnvOrFile(env, "GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEY_FILE"),
    serverKey: valueFromEnvOrFile(env, "GOOGLE_MAPS_SERVER_KEY", "GOOGLE_MAPS_SERVER_KEY_FILE") || valueFromEnvOrFile(env, "GOOGLE_ROUTES_API_KEY", "GOOGLE_ROUTES_API_KEY_FILE"),
  };
}

export async function geocodeWithGoogle(address, config, fetchImpl = fetch) {
  if (!config.serverKey) throw new Error("google_maps_not_configured");
  const query = String(address ?? "").trim();
  if (query.length < 5 || query.length > 240) throw new Error("invalid_geocode_address");
  const qualified = /Mendoza|Argentina|San Rafael|General Alvear|Malarg/i.test(query) ? query : `${query}, San Rafael, Mendoza, Argentina`;
  const params = new URLSearchParams({ address: qualified, key: config.serverKey, region: "ar", language: "es" });
  const response = await fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("google_maps_http_error");
  const body = await response.json();
  if (body.status !== "OK" || !body.results?.[0]?.geometry?.location) throw new Error(body.status === "ZERO_RESULTS" ? "geocode_not_found" : "google_maps_error");
  const result = body.results[0];
  if (result.partial_match || (result.types?.length && !result.types.some((type) => ["street_address", "premise", "subpremise"].includes(type)))) throw new Error("geocode_not_precise");
  return { address: result.formatted_address, lat: result.geometry.location.lat, lng: result.geometry.location.lng };
}


function waypoint(point) {
  if (typeof point?.address === 'string' && point.address.trim().length >= 5 && point.address.length <= 240) return { address: point.address.trim() };
  if (typeof point?.lat !== 'number' || typeof point?.lng !== 'number' || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) throw new Error('invalid_route_endpoint');
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}
export async function computeRouteWithGoogle(input, config, fetchImpl = fetch) {
  if (!config.serverKey) throw new Error('google_maps_not_configured');
  const origin = waypoint(input.origin); const destination = waypoint(input.destination);
  const res = await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.serverKey, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
    body: JSON.stringify({ origin, destination, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: true, languageCode: 'es', units: 'METRIC' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.routes?.length) throw new Error('google_maps_route_unavailable');
  const routes = body.routes.map(r => ({ distanceMeters: Number(r.distanceMeters), durationSeconds: Number.parseFloat(r.duration), encodedPolyline: r.polyline?.encodedPolyline }));
  if (routes.some(r => !Number.isFinite(r.distanceMeters) || r.distanceMeters < 0 || !Number.isFinite(r.durationSeconds) || r.durationSeconds < 0 || typeof r.encodedPolyline !== 'string' || !r.encodedPolyline)) throw new Error('google_maps_route_invalid');
  return { ...routes[0], alternatives: routes.slice(1) };
}
