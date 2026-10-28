import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Droplets, Map as MapIcon, Mountain, RadioTower, Users, Waves, Wifi } from "lucide-react";
import { storageGet, storageSet } from "@/lib/safe-storage";
import { BANDAS, repaintPng, type Stop } from "@/lib/relief-palette";

// Capas del mapa: antenas, cobertura, relieve respecto del km 0 y pendientes, para la ciudad
// y todo el departamento. Los datos son archivos fijos en /mapa (ver capas.json y tools/capas-mapa).

export type LayerKey = "personal" | "antenas" | "cobertura" | "relieve" | "pendientes" | "inundable";
export const CIUDAD = { north: -34.572, south: -34.668, west: -68.41, east: -68.265 };
export const DEPARTAMENTO = { north: -34.1, south: -36.0, west: -70.25, east: -66.75 };
const KEY = "schestakow.mapa.capas";
const ESCALA_KEY = "schestakow.mapa.paso";
// Metros por franja de color (6 franjas por encima y 6 por debajo del km 0: hasta ±4.500 m con 750).
const ESCALAS = [1, 2, 3, 5, 10, 15, 20, 25, 50, 100, 200, 350, 750];
const ESCALA_INICIAL = ESCALAS.indexOf(25);
const COLORS: Record<string, string> = { celular: "#7c3aed", radio_emergencia: "#16a34a", infra: "#475569", otros: "#0891b2" };
const CATEGORY: Record<string, string> = { celular: "Telefonía celular", radio_emergencia: "Radio VHF de emergencia", infra: "Torre compartida", otros: "Otra" };
const ANTENNA_PATH = "M 0,-11 L 7,6 L -7,6 Z";
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

type Bounds = { north: number; south: number; west: number; east: number };
type Grid = { bin: string; w: number; h: number; north: number; west: number; paso: number; factor: number };
type FlowGrid = { bin: string; w: number; h: number; north: number; west: number; paso: number };
type Field = FlowGrid & { data: Int16Array };
type Tower = {
  id: string; lat: number; lng: number; name: string; operator: string; type: string; height_m: number | null; tech: string; backup: string; notes: string;
  category: string; ubicacion: string; ubicacion_estado: string; terreno_m: number; vs_km0_m: number | null; respaldo_estado: string; ve_km0?: boolean;
  cobertura: null | { tipo: "radio"; radio_m: number; modelo: string } | { tipo: "vista"; png: string; bounds: Bounds; modelo: string };
};
export type Capas = {
  generado: string;
  km0: { lat: number; lng: number; elev_m: number; nombre: string };
  paleta: { levels: number[]; stops: Stop[] };
  ciudad: { png: string; bounds: Bounds; grilla: Grid; fuente: string };
  depto: { png: string; sombra: string; bounds: Bounds; grilla: Grid; contorno: [number, number][]; fuente: string };
  rango: { min: number; max: number };
  pendientes: { curvas: string; flujo: { ciudad: FlowGrid; depto: FlowGrid } };
  inundable?: { png: string; bounds: Bounds; cauces: string; hand: Grid; criterio: string };
  antenas: { lista: Tower[] };
};

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const compass = (deg: number) => COMPASS[Math.round(deg / 22.5) % 16];
const vsKm0 = (m: number) => Math.abs(m) < 1 ? "al nivel del km 0" : `${nf0.format(Math.abs(m))} m ${m < 0 ? "más bajo" : "más alto"} que el km 0`;
const box = (html: string) => `<div style="max-width:290px;font-size:13px;line-height:1.4">${html}</div>`;

function readOn(): Record<LayerKey, boolean> {
  const base = { personal: true, antenas: false, cobertura: false, relieve: false, pendientes: false, inundable: false };
  try { return { ...base, ...JSON.parse(storageGet(KEY) ?? "{}") }; } catch { return base; }
}
function readEscala() {
  const raw = storageGet(ESCALA_KEY);
  if (raw === null) return ESCALA_INICIAL;
  const i = Number(raw);
  return Number.isInteger(i) && i >= 0 && i < ESCALAS.length ? i : ESCALA_INICIAL;
}

// Imagen georreferenciada dibujada en un canvas del tamaño del mapa visible. GroundOverlay agranda la
// imagen entera con el zoom (10.000 px o más a nivel ciudad) y traba el navegador; esto dibuja sólo lo que se ve.
function canvasOverlay(g: any, map: any, src: string, bounds: Bounds, opacity: number) {
  const Overlay = class extends g.maps.OverlayView {
    img = new Image();
    canvas = document.createElement("canvas");
    listener: any = null;
    pending = 0;
    constructor() {
      super();
      Object.assign(this.canvas.style, { position: "absolute", pointerEvents: "none", opacity: String(opacity) });
      this.img.onload = () => this.schedule();
      this.img.src = src;
    }
    onAdd() {
      this.getPanes().overlayLayer.appendChild(this.canvas);
      this.listener = map.addListener("bounds_changed", () => this.schedule());
    }
    onRemove() {
      cancelAnimationFrame(this.pending);
      this.pending = 0;
      this.canvas.remove();
      if (this.listener) g.maps.event.removeListener(this.listener);
    }
    draw() { this.schedule(); }
    // Un solo dibujo por cuadro aunque el mapa avise muchas veces mientras se mueve.
    schedule() {
      if (!this.pending) this.pending = requestAnimationFrame(() => { this.pending = 0; this.paint(); });
    }
    paint() {
      const proj = this.getProjection(); const view = map.getBounds(); const div = map.getDiv();
      if (!proj || !view || !this.img.naturalWidth || !div.isConnected) return;
      const w = div.clientWidth, h = div.clientHeight;
      if (!w || !h) return;
      const tl = proj.fromLatLngToDivPixel(new g.maps.LatLng(view.getNorthEast().lat(), view.getSouthWest().lng()));
      const nw = proj.fromLatLngToDivPixel(new g.maps.LatLng(bounds.north, bounds.west));
      const se = proj.fromLatLngToDivPixel(new g.maps.LatLng(bounds.south, bounds.east));
      Object.assign(this.canvas.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${w}px`, height: `${h}px` });
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const ix = nw.x - tl.x, iy = nw.y - tl.y, iw = se.x - nw.x, ih = se.y - nw.y;
      const x0 = Math.max(0, ix), y0 = Math.max(0, iy), x1 = Math.min(w, ix + iw), y1 = Math.min(h, iy + ih);
      if (x1 <= x0 || y1 <= y0 || iw <= 0 || ih <= 0) return;
      const fx = this.img.naturalWidth / iw, fy = this.img.naturalHeight / ih;
      ctx.drawImage(this.img, (x0 - ix) * fx, (y0 - iy) * fy, (x1 - x0) * fx, (y1 - y0) * fy, x0, y0, x1 - x0, y1 - y0);
    }
  };
  const overlay = new Overlay();
  overlay.setMap(map);
  return overlay;
}

// Pendiente (E, N en m/m) en un punto: primero la grilla fina de la ciudad, si no la del departamento.
function sampleFlow(fields: Field[], lat: number, lng: number): [number, number] | null {
  for (const f of fields) {
    const x = (lng - f.west) / f.paso, y = (f.north - lat) / f.paso;
    if (x < 0 || y < 0 || x > f.w - 1 || y > f.h - 1) continue;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(f.w - 1, x0 + 1), y1 = Math.min(f.h - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const at = (cx: number, cy: number, k: number) => f.data[(cy * f.w + cx) * 2 + k];
    const lerp = (k: number) => (at(x0, y0, k) * (1 - fx) + at(x1, y0, k) * fx) * (1 - fy) + (at(x0, y1, k) * (1 - fx) + at(x1, y1, k) * fx) * fy;
    return [lerp(0) / 10000, lerp(1) / 10000];
  }
  return null;
}

// Agua en movimiento: partículas que bajan siguiendo la pendiente y dejan una estela corta.
function flowOverlay(g: any, map: any, fields: Field[]) {
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const Overlay = class extends g.maps.OverlayView {
    canvas = document.createElement("canvas");
    listener: any = null;
    frame = 0;
    dirty = true;
    view = { w: 0, h: 0, west: 0, east: 0, yTop: 0, yBot: 0 };
    parts: { x: number; y: number; age: number; max: number }[] = [];
    constructor() {
      super();
      Object.assign(this.canvas.style, { position: "absolute", pointerEvents: "none" });
    }
    onAdd() {
      this.getPanes().overlayLayer.appendChild(this.canvas);
      this.listener = map.addListener("bounds_changed", () => { this.dirty = true; });
      const loop = () => {
        if (!map.getDiv().isConnected) return;  // el mapa ya no está en pantalla: se corta solo
        if (this.dirty) { this.dirty = false; this.reset(); }
        this.step();
        this.frame = requestAnimationFrame(loop);
      };
      this.frame = requestAnimationFrame(loop);
    }
    onRemove() {
      cancelAnimationFrame(this.frame);
      this.canvas.remove();
      if (this.listener) g.maps.event.removeListener(this.listener);
    }
    draw() { this.dirty = true; }
    spawn() { return { x: Math.random() * this.view.w, y: Math.random() * this.view.h, age: 0, max: 40 + Math.random() * 60 }; }
    reset() {
      const proj = this.getProjection(); const b = map.getBounds(); const div = map.getDiv();
      if (!proj || !b) return;
      const w = div.clientWidth, h = div.clientHeight;
      const ne = b.getNorthEast(), sw = b.getSouthWest();
      const tl = proj.fromLatLngToDivPixel(new g.maps.LatLng(ne.lat(), sw.lng()));
      Object.assign(this.canvas.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${w}px`, height: `${h}px` });
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      this.canvas.getContext("2d")?.clearRect(0, 0, w, h);
      this.view = { w, h, west: sw.lng(), east: ne.lng(), yTop: merc(ne.lat()), yBot: merc(sw.lat()) };
      this.parts = Array.from({ length: Math.max(300, Math.min(1500, Math.round((w * h) / 600))) }, () => this.spawn());
    }
    step() {
      const ctx = this.canvas.getContext("2d"); const v = this.view;
      if (!ctx || !v.w) return;
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = "rgba(0,0,0,0.93)";
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1.6; ctx.lineCap = "round";
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      for (const p of this.parts) {
        const lng = v.west + (p.x / v.w) * (v.east - v.west);
        const lat = (Math.atan(Math.sinh(v.yTop - (p.y / v.h) * (v.yTop - v.yBot))) * 180) / Math.PI;
        const s = sampleFlow(fields, lat, lng);
        const slope = s ? Math.hypot(s[0], s[1]) : 0;
        if (!s || slope < 0.0005 || p.age++ > p.max || p.x < 0 || p.y < 0 || p.x > v.w || p.y > v.h) { Object.assign(p, this.spawn()); continue; }
        const pct = slope * 100;
        const speed = 0.35 + 2.2 * Math.min(1, Math.log10(1 + pct) / Math.log10(31));
        const nx = p.x - (s[0] / slope) * speed, ny = p.y + (s[1] / slope) * speed;
        const k = pct > 5 ? 2 : pct > 0.8 ? 1 : 0;
        paths[k].moveTo(p.x, p.y); paths[k].lineTo(nx, ny);
        p.x = nx; p.y = ny;
      }
      ["#0ea5e9", "#1d4ed8", "#172554"].forEach((color, i) => { ctx.strokeStyle = color; ctx.stroke(paths[i]); });
    }
  };
  const overlay = new Overlay();
  overlay.setMap(map);
  return overlay;
}

function towerHtml(t: Tower) {
  const warn = (text: string) => `<span style="background:#fef9c3;padding:0 3px;border-radius:3px">${esc(text)}</span>`;
  return box([
    `<strong>${esc(t.name)}</strong>`,
    esc([t.operator, t.type, t.height_m ? `${t.height_m} m` : ""].filter(Boolean).join(" · ")),
    esc([CATEGORY[t.category] ?? t.category, t.tech].filter(Boolean).join(" · ")),
    t.respaldo_estado === "genérico" ? `Energía: ${warn(`sin dato del sitio (el archivo supone «${t.backup}»)`)}` : `Energía: ${esc(t.backup)}${t.respaldo_estado === "desconocido" ? "" : " (según noticias)"}`,
    `Terreno: ${nf0.format(t.terreno_m)} m${t.vs_km0_m === null ? "" : ` · ${esc(vsKm0(t.vs_km0_m))}`}`,
    t.cobertura?.tipo === "radio" ? `Cobertura: ${nf1.format(t.cobertura.radio_m / 1000)} km de radio ${warn("estimado, no medido")}` : "",
    t.cobertura?.tipo === "vista" ? `Cobertura: zona verde = la ve en línea recta. Desde el km 0: ${t.ve_km0 ? "sí" : "no"} ${warn("modelo")}` : "",
    t.cobertura ? `<small>${esc(t.cobertura.modelo)}</small>` : "Cobertura: sin datos para estimarla",
    t.ubicacion_estado === "inferida" ? `Ubicación: ${warn(t.ubicacion)}` : `<small>Ubicación: ${esc(t.ubicacion)}</small>`,
    t.notes ? `<small>Nota del archivo: ${esc(t.notes)}</small>` : "",
  ].filter(Boolean).join("<br>"));
}

export function useMapLayers(map: any, ready: boolean) {
  const [on, setOn] = useState(readOn);
  const [escalaIdx, setEscalaIdx] = useState(readEscala);
  const [capas, setCapas] = useState<Capas | null>(null);
  const [error, setError] = useState("");
  const [urls, setUrls] = useState<{ ciudad: string; depto: string } | null>(null);
  const objs = useRef<Record<string, any[]>>({});
  const grids = useRef<{ ciudad?: Int16Array; depto?: Int16Array; hand?: Int16Array }>({});
  const pngs = useRef<{ ciudad?: Uint8Array; depto?: Uint8Array }>({});
  const info = useRef<any>(null);
  const framed = useRef(false);
  const escala = ESCALAS[escalaIdx];

  useEffect(() => {
    if (!ready || capas) return;
    fetch("/mapa/capas.json").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setCapas).catch(() => setError("No se pudieron cargar las capas del mapa."));
  }, [ready, capas]);

  // Al abrir, el mapa encuadra la ciudad de San Rafael.
  useEffect(() => {
    if (!ready || !map || framed.current) return;
    framed.current = true;
    map.fitBounds(CIUDAD, 0);
  }, [ready, map]);

  function toggle(key: LayerKey) {
    const next = { ...on, [key]: !on[key] };
    setOn(next);
    storageSet(KEY, JSON.stringify(next));
  }
  function setEscala(i: number) {
    setEscalaIdx(i);
    storageSet(ESCALA_KEY, String(i));
  }
  function view(kind: "ciudad" | "departamento") {
    if (map) map.fitBounds(kind === "ciudad" ? CIUDAD : DEPARTAMENTO, 0);
  }
  function clear(key: string) {
    for (const o of objs.current[key] ?? []) o.setMap(null);
    objs.current[key] = [];
  }
  function open(content: string, position: any, anchor?: any) {
    const g = window.google;
    if (!info.current) info.current = new g.maps.InfoWindow();
    info.current.setContent(content);
    if (!anchor) info.current.setPosition(position);
    info.current.open(anchor ? { map, anchor } : { map });
  }

  // Altura y pendiente en un punto: grilla de la ciudad (90 m) si cae adentro, si no la del departamento (450 m).
  function heightAt(lat: number, lng: number) {
    if (!capas) return null;
    for (const [kind, k] of [["ciudad", 3], ["depto", 1]] as const) {
      const g = capas[kind].grilla; const data = grids.current[kind];
      if (!data) continue;
      const x = (lng - g.west) / g.paso - 0.5; const y = (g.north - lat) / g.paso - 0.5;
      if (x < 0 || y < 0 || x > g.w - 1 || y > g.h - 1) continue;
      const at = (cx: number, cy: number) => data[Math.max(0, Math.min(g.h - 1, Math.round(cy))) * g.w + Math.max(0, Math.min(g.w - 1, Math.round(cx)))] * g.factor;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const rel = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      const mx = g.paso * 111320 * Math.cos((lat * Math.PI) / 180); const my = g.paso * 111320;
      const east = (at(x + k, y) - at(x - k, y)) / (2 * k * mx); const north = (at(x, y - k) - at(x, y + k)) / (2 * k * my);
      return { rel, pct: Math.hypot(east, north) * 100, dir: ((Math.atan2(-east, -north) * 180) / Math.PI + 360) % 360, fino: kind === "ciudad" };
    }
    return null;
  }

  // Antenas
  useEffect(() => {
    const g = window.google;
    clear("antenas");
    if (!ready || !map || !g?.maps || !capas || !on.antenas) return;
    objs.current.antenas = capas.antenas.lista.map((t) => {
      const marker = new g.maps.Marker({
        map, position: { lat: t.lat, lng: t.lng }, zIndex: 900,
        icon: { path: ANTENNA_PATH, fillColor: COLORS[t.category] ?? "#475569", fillOpacity: 1, strokeColor: t.ubicacion_estado === "inferida" ? "#eab308" : "#ffffff", strokeWeight: t.ubicacion_estado === "inferida" ? 3 : 2, scale: 1.1 },
      });
      marker.addListener("click", () => open(towerHtml(t), null, marker));
      return marker;
    });
    return () => clear("antenas");
  }, [ready, map, capas, on.antenas]);

  // Cobertura
  useEffect(() => {
    const g = window.google;
    clear("cobertura");
    if (!ready || !map || !g?.maps || !capas || !on.cobertura) return;
    objs.current.cobertura = capas.antenas.lista.flatMap((t) => {
      if (!t.cobertura) return [];
      const color = COLORS[t.category] ?? "#475569";
      if (t.cobertura.tipo === "radio") return [new g.maps.Circle({ map, center: { lat: t.lat, lng: t.lng }, radius: t.cobertura.radio_m, fillColor: color, fillOpacity: 0.05, strokeColor: color, strokeOpacity: 0.35, strokeWeight: 1, clickable: false })];
      return [canvasOverlay(g, map, `/mapa/${t.cobertura.png}`, t.cobertura.bounds, 0.2)];
    });
    return () => clear("cobertura");
  }, [ready, map, capas, on.cobertura]);

  // Relieve: se recolorea la paleta de las dos imágenes según la escala (sin bajar datos nuevos).
  useEffect(() => {
    if (!capas || !on.relieve) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        for (const kind of ["ciudad", "depto"] as const) {
          if (!pngs.current[kind]) pngs.current[kind] = new Uint8Array(await (await fetch(`/mapa/${capas[kind].png}`)).arrayBuffer());
          if (!grids.current[kind]) grids.current[kind] = new Int16Array(await (await fetch(`/mapa/${capas[kind].grilla.bin}`)).arrayBuffer());
        }
        if (cancelled) return;
        const make = (bytes: Uint8Array) => URL.createObjectURL(new Blob([repaintPng(bytes, capas.paleta.levels, escala)], { type: "image/png" }));
        const next = { ciudad: make(pngs.current.ciudad!), depto: make(pngs.current.depto!) };
        setUrls((prev) => { if (prev) window.setTimeout(() => { URL.revokeObjectURL(prev.ciudad); URL.revokeObjectURL(prev.depto); }, 3000); return next; });
      } catch { if (!cancelled) setError("No se pudo dibujar el relieve."); }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [capas, on.relieve, escala]);

  useEffect(() => {
    const g = window.google;
    clear("relieve");
    if (!ready || !map || !g?.maps || !capas || !on.relieve || !urls) return;
    objs.current.relieve = [canvasOverlay(g, map, urls.depto, capas.depto.bounds, 1), canvasOverlay(g, map, urls.ciudad, capas.ciudad.bounds, 1)];
    return () => clear("relieve");
  }, [ready, map, capas, on.relieve, urls]);

  // Km 0 y límite del departamento: referencia con relieve o pendientes.
  useEffect(() => {
    const g = window.google;
    clear("referencia");
    if (!ready || !map || !g?.maps || !capas || !(on.relieve || on.pendientes)) return;
    const marker = new g.maps.Marker({ map, position: { lat: capas.km0.lat, lng: capas.km0.lng }, zIndex: 950, label: { text: "0", color: "#ffffff", fontSize: "11px", fontWeight: "bold" }, icon: { path: g.maps.SymbolPath.CIRCLE, fillColor: "#111827", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, scale: 9 } });
    marker.addListener("click", () => open(box(`<strong>${esc(capas.km0.nombre)}</strong><br>${nf0.format(capas.km0.elev_m)} m sobre el nivel del mar: es el 0 del relieve.`), null, marker));
    const limite = new g.maps.Polyline({ map, path: capas.depto.contorno.map(([lng, lat]) => ({ lat, lng })), strokeColor: "#111827", strokeOpacity: 0.7, strokeWeight: 1.5, clickable: false });
    objs.current.referencia = [marker, limite];
    return () => clear("referencia");
  }, [ready, map, capas, on.relieve, on.pendientes]);

  // Pendientes: sombreado de laderas (departamento), agua en movimiento (ciudad y departamento) y curvas cada 5 m (ciudad).
  useEffect(() => {
    const g = window.google;
    clear("pendientes");
    if (!ready || !map || !g?.maps || !capas || !on.pendientes) return;
    let cancelled = false;
    const sombra = canvasOverlay(g, map, `/mapa/${capas.depto.sombra}`, capas.depto.bounds, 1);
    const curvas = new g.maps.Data();
    curvas.setStyle((f: any) => {
      const d = f.getProperty("d");
      return d === 0 ? { strokeColor: "#111827", strokeWeight: 2.5, strokeOpacity: 0.9 } : { strokeColor: d < 0 ? "#1d4ed8" : "#92400e", strokeWeight: d % 25 === 0 ? 1.4 : 0.7, strokeOpacity: d % 25 === 0 ? 0.7 : 0.4 };
    });
    curvas.addListener("click", (e: any) => {
      const d = e.feature.getProperty("d");
      open(box(`Curva de nivel: <strong>${nf0.format(capas.km0.elev_m + d)} m</strong><br>${esc(vsKm0(d))}`), e.latLng);
    });
    const byZoom = () => curvas.setMap((map.getZoom() ?? 12) >= 13 ? map : null);
    const zoomListener = map.addListener("zoom_changed", byZoom);
    const flujo = capas.pendientes.flujo;
    let agua: any = null;
    Promise.all([
      fetch(`/mapa/${capas.pendientes.curvas}`).then((r) => r.json()),
      ...[flujo.ciudad, flujo.depto].map((f) => fetch(`/mapa/${f.bin}`).then((r) => r.arrayBuffer()).then((buf) => ({ ...f, data: new Int16Array(buf) }))),
    ]).then(([c, ciudad, depto]) => {
      if (cancelled) return;
      curvas.addGeoJson(c); byZoom();
      agua = flowOverlay(g, map, [ciudad, depto]);
    }).catch(() => { if (!cancelled) setError("No se pudieron cargar las pendientes."); });
    objs.current.pendientes = [sombra, curvas, { setMap: () => { agua?.setMap(null); g.maps.event.removeListener(zoomListener); } }];
    return () => { cancelled = true; clear("pendientes"); };
  }, [ready, map, capas, on.pendientes]);

  // Tocar el mapa (con Relieve, Pendientes o Inundable): altura, diferencia con el km 0, hacia dónde corre el agua
  // y, en el oasis, cuántos metros por encima de la vía de escurrimiento más cercana.
  useEffect(() => {
    const g = window.google;
    if (!ready || !map || !g?.maps || !capas || !(on.relieve || on.pendientes || on.inundable)) return;
    for (const kind of ["ciudad", "depto"] as const) {
      if (!grids.current[kind]) fetch(`/mapa/${capas[kind].grilla.bin}`).then((r) => r.arrayBuffer()).then((buf) => { grids.current[kind] = new Int16Array(buf); }).catch(() => undefined);
    }
    if (capas.inundable && !grids.current.hand) fetch(`/mapa/${capas.inundable.hand.bin}`).then((r) => r.arrayBuffer()).then((buf) => { grids.current.hand = new Int16Array(buf); }).catch(() => undefined);
    const handAt = (lat: number, lng: number) => {
      const h = capas.inundable?.hand; const data = grids.current.hand;
      if (!h || !data) return null;
      const x = Math.round((lng - h.west) / h.paso - 0.5), y = Math.round((h.north - lat) / h.paso - 0.5);
      if (x < 0 || y < 0 || x >= h.w || y >= h.h) return null;
      const v = data[y * h.w + x] * h.factor;
      return v >= 3000 ? null : v;
    };
    const listener = map.addListener("click", (event: any) => {
      const p = heightAt(event.latLng.lat(), event.latLng.lng());
      if (!p) return;
      const water = p.pct < 0.15 ? "casi plano: el agua no tiene salida clara" : `pendiente ${nf1.format(p.pct)} % · el agua corre hacia el ${compass(p.dir)}`;
      const sobre = handAt(event.latLng.lat(), event.latLng.lng());
      const cauce = sobre === null ? "" : `<br>${sobre < 1.5 ? "<strong>Zona baja</strong>: " : ""}${nf1.format(sobre)} m por encima de la vía de escurrimiento más cercana`;
      open(box(`<strong>${nf0.format(capas.km0.elev_m + p.rel)} m</strong> · ${esc(vsKm0(p.rel))}<br>${esc(water)}${cauce}<br><small>Modelo de relieve ${p.fino ? "30 m" : "90 m"}: incluye árboles y techos, error de algunos metros.</small>`), event.latLng);
    });
    return () => g.maps.event.removeListener(listener);
  }, [ready, map, capas, on.relieve, on.pendientes, on.inundable]);

  // Inundable (estimado por relieve, oasis): franja baja junto a las vías de escurrimiento, bajos y las vías.
  useEffect(() => {
    const g = window.google;
    clear("inundable");
    if (!ready || !map || !g?.maps || !capas?.inundable || !on.inundable) return;
    const inu = capas.inundable;
    let cancelled = false;
    const zonas = canvasOverlay(g, map, `/mapa/${inu.png}`, inu.bounds, 1);
    const cauces = new g.maps.Data();
    cauces.setStyle((f: any) => {
      const km2 = f.getProperty("km2");
      return { strokeColor: "#1e3a8a", strokeOpacity: 0.85, strokeWeight: km2 >= 500 ? 4 : km2 >= 50 ? 2.5 : 1.5 };
    });
    cauces.addListener("click", (e: any) => open(box(`Vía de escurrimiento: junta el agua de <strong>${nf0.format(e.feature.getProperty("km2"))} km²</strong>.<br>Con lluvia fuerte, el agua baja por acá.<br><small>Estimada con el relieve; no incluye canales de riego ni desagües.</small>`), e.latLng));
    fetch(`/mapa/${inu.cauces}`).then((r) => r.json()).then((fc) => { if (!cancelled) { cauces.addGeoJson(fc); cauces.setMap(map); } }).catch(() => { if (!cancelled) setError("No se pudieron cargar las vías de escurrimiento."); });
    objs.current.inundable = [zonas, cauces];
    return () => { cancelled = true; clear("inundable"); };
  }, [ready, map, capas, on.inundable]);

  return { map, ready, on, toggle, view, escala, escalaIdx, setEscala, capas, error };
}

type Layers = ReturnType<typeof useMapLayers>;
const LABELS: [LayerKey, string, typeof Users][] = [["personal", "Personal", Users], ["antenas", "Antenas", RadioTower], ["cobertura", "Cobertura", Wifi], ["relieve", "Relieve", Mountain], ["pendientes", "Pendientes", Droplets], ["inundable", "Inundable", Waves]];

export function MapLayerButtons({ on, toggle, view, personalCount }: Layers & { personalCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <div className="flex gap-1" role="group" aria-label="Encuadre">
        <button type="button" onClick={() => view("ciudad")} className="flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><Building2 className="size-4" aria-hidden="true" />Ciudad</button>
        <button type="button" onClick={() => view("departamento")} className="flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><MapIcon className="size-4" aria-hidden="true" />Departamento</button>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="Capas del mapa">
        {LABELS.map(([key, label, Icon]) => (
          <button key={key} type="button" aria-pressed={on[key]} onClick={() => toggle(key)} className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${on[key] ? "bg-primary text-primary-fg" : "border border-border"}`}>
            <Icon className="size-4" aria-hidden="true" />{label}{key === "personal" ? ` (${personalCount})` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

// Panel sobre el mapa (sigue visible en pantalla completa): escala del relieve y qué significa cada capa prendida.
function MapPanel({ on, escala, escalaIdx, setEscala, capas }: Layers & { capas: Capas }) {
  const [abierto, setAbierto] = useState(true);
  const lines = [
    on.pendientes ? "Líneas azules en movimiento: por dónde corre el agua (más rápidas y oscuras = más pendiente). Sombra: laderas. Al acercarte, curvas cada 5 m." : "",
    on.antenas ? "▲ violeta celular · ▲ verde radio de emergencia." : "",
    on.cobertura ? "Círculos: cobertura celular estimada. Verde: se ve la repetidora." : "",
    on.inundable ? "Inundable (estimado): líneas = por dónde baja el agua; celeste = franja baja junto a ellas; rojo = bajos donde se junta." : "",
  ].filter(Boolean);
  if (!on.relieve && !lines.length) return null;
  return (
    <div className="m-2 w-64 max-w-[calc(100vw-5rem)] rounded-xl bg-surface p-2 text-xs shadow-lg">
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className="flex min-h-9 w-full items-center justify-between gap-2 font-semibold">
        <span>{on.relieve ? `Relieve · cada color ${nf0.format(escala)} m` : "Referencias"}</span><span aria-hidden="true">{abierto ? "–" : "+"}</span>
      </button>
      {abierto ? (
        <div className="space-y-1.5">
          {on.relieve ? (
            <>
              <div className="flex h-4 overflow-hidden rounded" aria-hidden="true">{BANDAS.map((color) => <span key={color} className="flex-1" style={{ background: color }} />)}</div>
              <div className="flex justify-between tabular-nums text-muted"><span>−{nf0.format(escala * 6)} m</span><span>verde = km 0</span><span>+{nf0.format(escala * 6)} m</span></div>
              <input type="range" min={0} max={ESCALAS.length - 1} step={1} value={escalaIdx} onChange={(event) => setEscala(Number(event.target.value))} className="h-9 w-full accent-primary" aria-label="Metros que abarca cada color del relieve" />
              <p className="text-muted">Hacia el rojo, más alto que el km 0; hacia el azul, más bajo. Barra a la izquierda: franjas finas para ver los niveles de la ciudad; a la derecha: todo el departamento. Tocá el mapa para ver la altura exacta.</p>
            </>
          ) : null}
          {lines.map((line) => <p key={line} className="text-muted">{line}</p>)}
        </div>
      ) : null}
    </div>
  );
}

export function MapLayerLegend(layers: Layers) {
  const { map, ready, on, capas, error } = layers;
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const g = window.google;
    if (!ready || !map || !g?.maps) return;
    const el = document.createElement("div");
    const controls = map.controls[g.maps.ControlPosition.TOP_LEFT];
    controls.push(el);
    setSlot(el);
    return () => {
      const i = controls.getArray().indexOf(el);
      if (i >= 0) controls.removeAt(i);
      setSlot(null);
    };
  }, [ready, map]);
  const any = on.antenas || on.cobertura || on.relieve || on.pendientes || on.inundable;
  return (
    <>
      {slot && capas ? createPortal(<MapPanel {...layers} capas={capas} />, slot) : null}
      {error ? <p className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">{error}</p> : null}
      {capas && any ? (
        <details className="rounded-xl bg-surface px-3 py-2 text-xs text-muted shadow-[var(--shadow-border)]">
          <summary className="min-h-9 cursor-pointer py-2 font-medium">Sobre estos datos</summary>
          <ul className="list-disc space-y-1 pb-2 pl-4">
            <li>Relieve: {capas.ciudad.fuente} en la ciudad y {capas.depto.fuente} en el departamento. Mide hasta la copa de los árboles y los techos: error de algunos metros. En el departamento va de {nf0.format(capas.rango.min)} a +{nf0.format(capas.rango.max)} m respecto del km 0 ({nf0.format(capas.km0.elev_m)} m s. n. m.).</li>
            <li><strong>Más bajo que el km 0 no quiere decir inundable</strong>: la ciudad baja de oeste a este; el agua se junta en los bajos y cauces. Las líneas azules en movimiento muestran hacia dónde escurre.</li>
            <li>Antenas: {capas.antenas.lista.length}, del Boletín Municipal 2022 y noticias 2024-2025. No es inventario oficial (faltan Movistar) ni señal en tiempo real. Borde amarillo: ubicación a confirmar.</li>
            <li>Cobertura celular: radio estimado por modelo según altura, no medido. Repetidoras VHF: línea de vista desde la cumbre, requisito para comunicarse pero no garantía.</li>
            {capas.inundable ? <li>Inundable: <strong>estimado con el relieve, no es el mapa oficial</strong>. {capas.inundable.criterio} Cubre el oasis (ciudad y alrededores). No ve canales de riego, desagües ni obras, y los árboles y techos agregan error. El estudio oficial es el de peligrosidad geológica de la ciudad de San Rafael del SEGEMAR (2019).</li> : null}
          </ul>
        </details>
      ) : null}
    </>
  );
}
