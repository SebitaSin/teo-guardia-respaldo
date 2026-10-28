import test from "node:test";
import assert from "node:assert/strict";
import { parseOpenMeteo } from "./weather.ts";

const retrieved = "2026-10-26T21:15:00Z"; // 18:15 de San Rafael
const forecast = () => ({
  utc_offset_seconds: -10800,
  current: { time: "2026-10-26T18:15", precipitation: 0, weather_code: 0 },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-10-${i < 24 ? "26" : "27"}T${String(i % 24).padStart(2, "0")}:00`),
    precipitation: Array(48).fill(0), weather_code: Array(48).fill(0), wind_speed_10m: Array(48).fill(10),
  },
});

test("las próximas dos horas no incluyen la lluvia ni el granizo de la madrugada", () => {
  const raw = forecast();
  raw.hourly.precipitation[0] = 30; raw.hourly.weather_code[1] = 99;
  const state = parseOpenMeteo(raw, retrieved);
  assert.deepEqual(state.windows.find((item) => item.id === "0-2h")?.precip_mm, 0);
  assert.equal(state.windows.find((item) => item.id === "0-2h")?.hail, false);
  assert.equal(state.windows.find((item) => item.id === "2-6h")?.hail, false);
});

test("un evento de la noche entra en su ventana real y no en el tramo de mañana", () => {
  const raw = forecast(); raw.hourly.precipitation[18] = 5; raw.hourly.precipitation[19] = 7; raw.hourly.weather_code[21] = 96;
  const state = parseOpenMeteo(raw, retrieved);
  assert.equal(state.windows.find((item) => item.id === "0-2h")?.precip_mm, 12);
  assert.equal(state.windows.find((item) => item.id === "0-2h")?.hail, false);
  assert.equal(state.windows.find((item) => item.id === "2-6h")?.hail, true);
});

test("un hueco horario no acerca a hoy una tormenta prevista para mañana", () => {
  const raw = forecast();
  raw.hourly = { time: ["2026-10-27T08:00"], precipitation: [30], weather_code: [99], wind_speed_10m: [60] };
  const state = parseOpenMeteo(raw, retrieved);
  assert.equal(state.windows.find((item) => item.id === "0-2h")?.precip_mm, null);
  assert.equal(state.windows.find((item) => item.id === "12-24h")?.hail, true);
});

test("horas con zona explícita y horas locales describen la misma ventana", () => {
  const local = forecast(); const utc = forecast();
  local.hourly.precipitation[18] = 9; utc.hourly.precipitation[18] = 9;
  utc.hourly.time = utc.hourly.time.map((time) => new Date(Date.parse(time + "Z") + 3 * 3_600_000).toISOString());
  assert.deepEqual(parseOpenMeteo(local, retrieved).windows, parseOpenMeteo(utc, retrieved).windows);
});
