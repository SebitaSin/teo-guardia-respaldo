import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyBedCapacity, ucoBedKey } from "../src/data/bed-capacity.mjs";
import { confirmBed, publishReading, readBoards } from "./boards.mjs";
import { createHospitalServer } from "./app.mjs";
import { issueSession, sessionCookie } from "./auth.mjs";

const bed = (cama, extra = {}) => ({ slug: "uco", servicio: "UCO", cama, estado: "OCUPADA", paciente: "PACIENTE DE PRUEBA", ...extra });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sch-uco-capacity-"));
  const internacionFile = join(root, "internacion.json");
  const catalog = [..."123456"].map((n) => bed(`C/${n}`)).concat([bed("7"), bed("8"), bed("9", { slug: "tip", servicio: "TIP" })]);
  const legacy = [..."123456"].map((n) => bed(`C/${n}`, { visto: false })).concat([bed("7"), bed("8")], [..."123456"].map((n) => bed(n, { visto: true, revision: "REVISAR" })));
  writeFileSync(internacionFile, JSON.stringify({ beds: catalog }));
  mkdirSync(join(root, "boards"));
  writeFileSync(join(root, "boards", "current.json"), JSON.stringify({ services: { uco: { slug: "uco", servicio: "UCO", hash: "anterior", foto_fecha: "2026-10-25T12:00:00Z", beds: legacy } } }));
  return { root, internacionFile, catalog, legacy, done: () => { assert.ok(root.startsWith(join(tmpdir(), "sch-uco-capacity-"))); rmSync(root, { recursive: true, force: true }); } };
}
const capture = (hash) => ({ hash, captura_id: hash, texto: "UCO", foto_fecha: "2026-10-26T12:00:00Z" });
const row = (cama) => ({ bed: cama, service: "UCO", patient: null, confidence: 95 });

test("UCO reconoce las mismas seis camas con o sin C/ y no acepta otras etiquetas", () => {
  assert.deepEqual(["1", "C/1", "c/01", "01", "CAMA 1"].map(ucoBedKey), ["1", "1", "1", "1", "1"]);
  for (const value of ["0", "7", "8", "C/7", "1/2", "?", null]) assert.equal(ucoBedKey(value), null);
});

test("el catálogo y la pizarra anterior quedan en seis camas; prevalece la fila vista", () => {
  const ctx = fixture();
  try {
    const limited = applyBedCapacity(ctx.catalog);
    assert.equal(limited.filter((item) => item.slug === "uco").length, 6);
    assert.equal(limited.find((item) => item.slug === "tip").cama, "9");
    const board = readBoards(ctx.root).services.uco;
    assert.deepEqual(board.beds.map((item) => item.cama), [..."123456"]);
    assert.ok(board.beds.every((item) => item.visto));
    assert.equal(JSON.parse(readFileSync(join(ctx.root, "boards", "current.json"), "utf8")).services.uco.beds.length, 14);
    assert.throws(() => confirmBed({ dataDir: ctx.root, slug: "uco", cama: "7", actor: "prueba" }), /bed_not_found/);
  } finally { ctx.done(); }
});

test("una nueva lectura de UCO usa las seis camas físicas y conserva confirmaciones al cambiar de etiqueta", () => {
  const ctx = fixture();
  try {
    confirmBed({ dataDir: ctx.root, slug: "uco", cama: "1", actor: "prueba", values: { estado: "LIBRE" } });
    const result = publishReading({ dataDir: ctx.root, internacionFile: ctx.internacionFile, capture: capture("valida"), reading: { rows: [row("01"), { ...row("2"), patient: "PACIENTE NUEVO DE PRUEBA" }, row("3"), row("C/04"), row("5"), row("6")] } });
    assert.equal(result.estado, "PUBLICADA");
    const beds = readBoards(ctx.root).services.uco.beds;
    assert.deepEqual(beds.map((item) => item.cama), [..."123456"].map((n) => `C/${n}`));
    assert.equal(beds[0].revision, "CONFIRMADA");
    assert.ok(beds.every((item) => item.visto));
    assert.equal(beds[1].estado, "OCUPADA");
    assert.ok(!beds[1].motivos.includes("cama no encontrada en el parte actual"));
    assert.ok(beds.filter((_, index) => index !== 1).every((item) => item.estado === "LIBRE"));
  } finally { ctx.done(); }
});

test("una lectura fuera de rango o duplicada no reemplaza la pizarra válida de UCO", () => {
  const ctx = fixture();
  try {
    const original = readFileSync(join(ctx.root, "boards", "current.json"), "utf8");
    for (const labels of [["1", "7"], ["C/8"], ["1", "C/01"], [..."1234567"], ["?"]]) {
      const result = publishReading({ dataDir: ctx.root, internacionFile: ctx.internacionFile, capture: capture(labels.join("-")), reading: { rows: labels.map(row) } });
      assert.equal(result.estado, "NO_PUBLICADA");
      assert.match(result.motivo, /máximo de 6 camas/);
      assert.equal(readFileSync(join(ctx.root, "boards", "current.json"), "utf8"), original);
    }
  } finally { ctx.done(); }
});

test("las respuestas de la app sirven sólo seis camas UCO aunque los archivos anteriores tengan más", async () => {
  const ctx = fixture();
  const user = { id: "prueba", name: "Prueba", role: "DIRECTION" };
  const authConfig = { secret: "s".repeat(32), users: [user], secureCookie: false, sessionHours: 1 };
  const server = createHospitalServer({ distDir: ctx.root, dataDir: ctx.root, internacionFile: ctx.internacionFile, authConfig, waConfig: {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { cookie: sessionCookie(issueSession(user, authConfig), authConfig) };
    const bootstrap = await fetch(`${base}/api/bootstrap`, { headers });
    assert.equal(bootstrap.status, 200);
    assert.equal((await bootstrap.json()).internacion.beds.filter((item) => item.slug === "uco").length, 6);
    const boards = await fetch(`${base}/api/boards`, { headers });
    assert.equal(boards.status, 200);
    assert.equal((await boards.json()).services.uco.beds.length, 6);
  } finally { await new Promise((resolve) => server.close(resolve)); ctx.done(); }
});
