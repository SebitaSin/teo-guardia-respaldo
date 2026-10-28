import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { alertLevel, computeAlerts, createWeatherWatch, localWeatherBrief, parseCap, quakeAlerts, weatherTime } from "./weather-watch.mjs";

const NOW = Date.parse("2026-10-26T20:00:00Z");
const at = (hours) => new Date(NOW + hours * 3_600_000).toISOString();
const source = (datos) => ({ ok: true, en: at(0), datos });
const base = () => ({
  oficial: source({ alertas: [] }), pronostico: source({ alertas: [], horas: [] }),
  radar: source({ imagen: at(0), vigente: true, alertas: [] }),
});
const warning = (extra = {}) => ({ alcance: "LOCAL", nivel: "naranja", evento: "Tormentas", fenomeno: "Tormentas", desde: at(-1), hasta: at(3), certeza: "Likely", ...extra });

test("el CAP real de nevada a 106 km es regional y no es un aviso a corto plazo", () => {
  const xml = readFileSync(new URL("./fixtures/smn-nevadas-cordillera-20261026.xml", import.meta.url), "utf8");
  const alert = parseCap(xml, "https://ssl.smn.gob.ar/feeds/CAP/xml_generados/CAP_20261026121210_Nevada_Cordillera_alertas_alertas_1.xml");
  assert.deepEqual([alert.evento, alert.corto_plazo, alert.alcance, alert.distancia_km], ["Nevadas", false, "REGIONAL", 106]);
  const state = base(); state.oficial.datos.alertas = [alert];
  state.nivel = alertLevel(state, NOW);
  assert.equal(state.nivel.grado, 1);
  assert.doesNotMatch(localWeatherBrief(state, NOW).texto, /nieve|nevadas|refuer|ambulancia/i);
});

test("el CAP real de tormentas que cubre San Rafael conserva su aviso local", () => {
  const xml = readFileSync(new URL("./fixtures/smn-tormentas-san-rafael-20261026.xml", import.meta.url), "utf8");
  const alert = parseCap(xml, "https://ssl.smn.gob.ar/feeds/CAP/xml_generados/tormentas.xml");
  const state = base(); state.oficial.datos.alertas = [alert]; state.nivel = alertLevel(state, NOW);
  assert.deepEqual([alert.alcance, state.nivel.grado, state.nivel.color], ["LOCAL", 4, "amarillo"]);
  assert.match(localWeatherBrief(state, NOW).texto, /Tormentas \(amarillo\).*21:00/);
});

test("Immediate no transforma una alerta común en ACP y mensajes de prueba o cancelación no alertan", () => {
  const xml = readFileSync(new URL("./fixtures/smn-nevadas-cordillera-20261026.xml", import.meta.url), "utf8");
  assert.equal(parseCap(xml.replace("<status>Actual</status>", "<status>Test</status>"), "u"), null);
  assert.equal(parseCap(xml.replace("<msgType>Update</msgType>", "<msgType>Cancel</msgType>"), "u"), null);
});

test("un ACP fuera del polígono no se convierte en alerta local por estar a pocos km", () => {
  const state = base(); state.oficial.datos.alertas = [warning({ alcance: "REGIONAL", distancia_km: 10, corto_plazo: true, nivel: "rojo" })];
  assert.deepEqual([alertLevel(state, NOW).grado, state.oficial.datos.alertas.length], [1, 1]);
});

test("el futuro a más de seis horas permanece visible sin elevar la alerta actual", () => {
  const state = base(); state.oficial.datos.alertas = [warning({ desde: at(12), hasta: at(24) })];
  state.pronostico.datos.alertas = [{ tipo: "granizo", nivel: "naranja", titulo: "Granizo previsto", desde: at(12), hasta: at(15) }];
  assert.equal(alertLevel(state, NOW).grado, 2);
  assert.equal(state.oficial.datos.alertas[0].operativa, false);
  assert.equal(state.pronostico.datos.alertas.length, 0);
  assert.equal(state.pronostico.datos.menores.length, 1);
  assert.equal(state.oficial.datos.alertas.length, 1);
});

test("un aviso vencido no conserva la emergencia porque falle la fuente", () => {
  const state = base(); state.oficial.ok = false;
  state.oficial.datos.alertas = [warning({ nivel: "rojo", hasta: at(-1) })];
  const level = alertLevel(state, NOW);
  assert.deepEqual([level.grado, level.incompleto, state.oficial.datos.alertas[0].vigente], [1, true, false]);
});

test("horas sin zona con segundos se interpretan en Mendoza y fechas inválidas se señalan", () => {
  assert.equal(weatherTime("2026-10-26T17:00:00"), NOW);
  assert.equal(weatherTime("2026-10-26T17:00"), NOW);
  assert.ok(Number.isNaN(weatherTime("dato inválido")));
  const state = base(); state.oficial.datos.alertas = [warning({ desde: "dato inválido", hasta: "otro" })];
  const level = alertLevel(state, NOW);
  assert.equal(level.grado, 1);
  assert.ok(level.faltan.includes("horarios del SMN"));
});

test("una imagen vieja, futura o sin fecha no confirma un núcleo actual", () => {
  for (const imagen of [at(-2), at(2), null]) {
    const state = base(); state.radar.datos.imagen = imagen;
    state.radar.datos.alertas = [{ grado: 8, titulo: "Núcleo de granizo extenso sobre San Rafael", detalle: "x" }];
    const level = alertLevel(state, NOW);
    assert.equal(level.grado, 1);
    assert.ok(level.faltan.includes("radar"));
    assert.equal(state.radar.datos.alertas.length, 0);
  }
});

test("una celda regional estacionaria no se vuelve preparación por una alerta amarilla local", () => {
  const state = base(); state.oficial.datos.alertas = [warning({ nivel: "amarillo" })];
  state.radar.datos.alertas = [{ sostenida: true, afecta_ciudad: false, grado: 5, titulo: "Eco persistente a 40 km", detalle: "x" }];
  const level = alertLevel(state, NOW);
  assert.equal(level.grado, 4);
  assert.equal(level.motivos.some((item) => item.origen === "Radar"), false);
  assert.equal(state.radar.datos.menores.length, 1);
});

test("una alerta de calor no corrobora una tormenta ni un pronóstico de granizo", () => {
  const state = base(); state.oficial.datos.alertas = [warning({ nivel: "amarillo", evento: "Calor", fenomeno: "Calor" })];
  state.pronostico.datos.alertas = [{ tipo: "granizo", nivel: "naranja", titulo: "Granizo previsto", desde: at(1), hasta: at(2) }];
  const level = alertLevel(state, NOW);
  assert.equal(level.grado, 4);
  assert.equal(state.pronostico.datos.alertas[0].grado, 4);
});

test("el resumen descarta el parte anterior y no agrega nevadas regionales ni órdenes de refuerzo", () => {
  const state = base(); state.oficial.datos.alertas = [warning({ nivel: "amarillo" }), warning({ alcance: "REGIONAL", evento: "Nevadas", fenomeno: "Nevadas" })];
  state.parte = { texto: "Refuercen personal por nieve en la cordillera" };
  state.nivel = alertLevel(state, NOW);
  const text = localWeatherBrief(state, NOW).texto;
  assert.match(text, /Tormentas.*amarillo/);
  assert.doesNotMatch(text, /nieve|nevadas|refuer|convoc|activar|energía/i);
});

test("un cálculo sísmico aproximado no declara por sí solo catástrofe", () => {
  const alerts = quakeAlerts([{ en: at(0), mg: 8.5, km: 10, prof: 10, prov: "Mendoza" }], NOW);
  assert.equal(alerts[0].grado, 8);
  assert.doesNotMatch(alerts[0].titulo, /daños|catástrofe/i);
});

test("un acumulado del modelo se informa como lluvia prevista y no como aluvión confirmado", () => {
  const hours = Array.from({ length: 24 }, (_, index) => ({ t: `2026-10-26T${String(index).padStart(2, "0")}:00`, rain: 3, temp: 20, prob: 80 }));
  const alerts = computeAlerts(hours).filter((item) => item.tipo === "lluvia");
  assert.ok(alerts.length > 0);
  assert.doesNotMatch(alerts.map((item) => item.titulo).join(" "), /inundaci[oó]n|aluvi[oó]n/i);
  assert.match(alerts.map((item) => item.detalle).join(" "), /mm/);
});

test("al fallar las fuentes no se eterniza el radar almacenado ni el grado anterior", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "sch-weather-relevance-"));
  try {
    const state = base(); state.en = at(-4); state.nivel = { grado: 8, color: "rojo", desde: at(-4) };
    state.parte = { texto: "Refuercen por nevadas regionales", en: at(-4) };
    state.oficial = { ok: true, en: at(-4), datos: { alertas: [warning({ nivel: "rojo", hasta: at(-1) })] } };
    state.radar.en = at(-4); state.radar.datos.imagen = at(-4);
    state.radar.datos.alertas = [{ grado: 8, titulo: "Núcleo intenso sobre San Rafael", detalle: "x" }];
    mkdirSync(join(dataDir, "clima"));
    writeFileSync(join(dataDir, "clima", "estado.json"), JSON.stringify(state));
    const urls = [];
    const watch = createWeatherWatch({ dataDir, now: () => new Date(NOW), env: { AI_WEATHER_BRIEF: "true", OPENAI_API_KEY: "fake-test-only", OPENAI_MODEL: "test" }, fetchImpl: async (url) => { urls.push(String(url)); return { ok: false, status: 503 }; } });
    const next = await watch.get();
    assert.equal(next.nivel.grado, 1);
    assert.equal(next.nivel.incompleto, true);
    assert.equal(next.radar.datos.vigente, false);
    assert.deepEqual(next.radar.datos.alertas, []);
    assert.doesNotMatch(next.parte.texto, /nevadas|refuer/i);
    assert.equal(next.nivel.bajando, undefined);
    assert.equal(urls.some((url) => /openai/.test(url)), false);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test("una descarga parcial del SMN no se interpreta como ausencia de alertas locales", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "sch-weather-partial-"));
  try {
    const prior = base(); prior.en = at(-0.2); prior.oficial.en = at(-0.2);
    prior.oficial.datos.alertas = [warning()];
    mkdirSync(join(dataDir, "clima"));
    writeFileSync(join(dataDir, "clima", "estado.json"), JSON.stringify(prior));
    const xml = readFileSync(new URL("./fixtures/smn-nevadas-cordillera-20261026.xml", import.meta.url), "utf8");
    const fetchImpl = async (url) => {
      if (String(url).endsWith("AR.php")) return { ok: true, text: async () => '<a href="https://ssl.smn.gob.ar/feeds/CAP/a.xml">CAP</a><a href="https://ssl.smn.gob.ar/feeds/CAP/b.xml">CAP</a>' };
      if (String(url).endsWith("a.xml")) return { ok: true, text: async () => xml };
      return { ok: false, status: 503 };
    };
    const next = await createWeatherWatch({ dataDir, now: () => new Date(NOW), env: {}, fetchImpl }).refresh();
    assert.equal(next.oficial.ok, false);
    assert.match(next.oficial.error, /lectura_parcial_smn_1_de_2/);
    assert.equal(next.oficial.datos.alertas[0].alcance, "LOCAL");
    assert.equal(next.nivel.grado, 6);
    assert.equal(next.nivel.incompleto, true);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});
