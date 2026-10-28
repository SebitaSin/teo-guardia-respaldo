export type TransportMode = "CAR" | "MOTORCYCLE" | "BICYCLE" | "PUBLIC_TRANSPORT" | "WALKING" | "OTHER" | "UNKNOWN";

export type PrivateStaffLocation = {
  staffId: string;
  address: string;
  lat: number;
  lng: number;
  transportMode: TransportMode;
  updatedAt: string;
  updatedBy: string;
  /** Traslado solidario en catástrofe: lo que la persona declaró, con fecha y quién lo cargó. */
  solidario?: Solidario;
};
export type Solidario = { vehiculoSeguro: boolean; dispuesto: boolean; lugares: number; necesitaTraslado: boolean; en: string; por: string };

export type MapsConfig = { configured: boolean; browserKey: string | null; routesConfigured: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`${path}_${response.status}${body?.error ? `:${body.error}` : ""}`);
  }
  return response.json() as Promise<T>;
}

export function loadMapConfig() {
  return api<MapsConfig>("/api/maps/config");
}

export async function loadPrivateLocations() {
  return (await api<{ locations: PrivateStaffLocation[] }>("/api/continuidad/private-locations")).locations;
}

export function geocodeAddress(address: string) {
  return api<{ address: string; lat: number; lng: number }>("/api/maps/geocode", { method: "POST", body: JSON.stringify({ address }) });
}

export type RouteEndpoint = { lat: number; lng: number } | { address: string };
type ComputedRoute = { distanceMeters: number; durationSeconds: number; encodedPolyline: string };

export function computeRoute(origin: RouteEndpoint, destination: RouteEndpoint) {
  return api<ComputedRoute & { alternatives: ComputedRoute[] }>("/api/maps/route", { method: "POST", body: JSON.stringify({ origin, destination }) });
}

export function savePrivateLocation(location: Pick<PrivateStaffLocation, "staffId" | "address" | "lat" | "lng" | "transportMode"> & { expectedAddress?: string }) {
  return api<{ location: PrivateStaffLocation }>("/api/continuidad/private-locations", { method: "POST", body: JSON.stringify(location) });
}

export function saveSolidario(input: { staffId: string; transportMode?: TransportMode; vehiculoSeguro: boolean; dispuesto: boolean; lugares: number; necesitaTraslado: boolean }) {
  return api<{ location: PrivateStaffLocation }>("/api/continuidad/solidario", { method: "POST", body: JSON.stringify(input) });
}

export function removePrivateLocation(staffId: string) {
  return api<{ deleted: boolean }>("/api/continuidad/private-locations", { method: "DELETE", body: JSON.stringify({ staffId }) });
}

