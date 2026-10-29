import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { appendAudit, readJson, writeJsonAtomic } from "./store.mjs";
import { verifyOpenAi } from "./ai.mjs";
// WhatsApp: Cloud API oficial para envios. El receptor vinculado se mantiene
// encendido porque es el unico camino que recibe las pizarras de los grupos.
// Se carga a demanda: el paquete de Render no incluye server/wa-link/ y alli
// la app tiene que arrancar igual, sin receptor.
import { createLabLookup } from "./lab-lookup.mjs";
import { createHospitalServer } from "./app.mjs";
import { loadAuthConfig } from "./auth.mjs";
import { whatsappConfig } from "./whatsapp.mjs";
import { createMailRunner, scheduleMailSync, scheduleWhatsAppDrafts } from "./scheduler.mjs";
import { aiConfig } from "./ai.mjs";
import { createWeatherWatch } from "./weather-watch.mjs";
import { spawn } from "node:child_process";
import { mapsConfig } from "./maps.mjs";
import { createPhotoIntake } from "./photo-intake.mjs";

const root = resolve(process.env.APP_ROOT || process.cwd());
const dataDir = resolve(process.env.APP_DATA_DIR || resolve(root, "var"));
const distDir = resolve(process.env.APP_DIST_DIR || resolve(root, "dist"));
const catalogFile = resolve(process.env.APP_CATALOG_FILE || resolve(root, "src", "data", "catalog.json"));
const internacionFile = resolve(process.env.APP_INTERNACION_FILE || resolve(root, "src", "data", "internacion.json"));
const backgroundMoved = readJson(resolve(root, "server", "runtime-owner.local.json"), {}).owner === "render";
if (backgroundMoved) process.env.GMAIL_SYNC_ENABLED = "false";
// Replit injects PORT and only exposes services bound to 0.0.0.0.
// Local secure launches can still pin APP_HOST/APP_PORT explicitly.
const host = process.env.APP_HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.APP_PORT || process.env.PORT || 8788);
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
// Parámetros no secretos de la lectura de pizarras por IA (la clave nunca va en este archivo).
for (const [key, value] of Object.entries(readJson(resolve(root, "server", "ai-config.json"), {}))) { if (/^(AI_|OPENAI_MODEL$)/.test(key)) process.env[key] ??= String(value); }

const mailRunner = backgroundMoved ? null : createMailRunner({ root, dataDir });
const authConfig = loadAuthConfig();
const waLink = await (async () => {
  if (backgroundMoved) return { start() {}, stop() {}, status: () => ({ estado: "TRASLADADO_A_RENDER" }) };
  try {
    const { createWaLink } = await import("./wa-link/supervisor.mjs");
    return createWaLink({ root, dataDir });
  } catch {
    return { start() {}, stop() {}, status: () => ({ estado: "NO_INSTALADO" }) };
  }
})();
const photoIntake = createPhotoIntake({ root, dataDir, ai: aiConfig(), waLink, internacionFile, lab: createLabLookup({ root }) });
// Clima: se actualiza cada 10 minutos aunque nadie tenga la pantalla abierta, para detectar los cambios de nivel.
// No se ejecutan avisos automáticos al cambiar de nivel.
const weatherWatch = createWeatherWatch({ dataDir });
const weatherTimer = setInterval(() => { weatherWatch.refresh().catch(() => undefined); }, 10 * 60_000);
weatherTimer.unref();
setTimeout(() => { weatherWatch.refresh().catch(() => undefined); }, 15_000).unref();
const server = createHospitalServer({ distDir, dataDir, catalogFile, internacionFile, authConfig, waConfig: whatsappConfig(), ai: aiConfig(), maps: mapsConfig(), mailRunner, photoIntake, weatherWatch });
photoIntake.start();
waLink.start();
// Prueba de modelos de IA, sólo si se pidió en ai-config.json: corre una vez, en segundo plano, y no cambia lo publicado.
if (String(process.env.AI_COMPARE ?? "").toLowerCase() === "true") setTimeout(() => { import("./ai-compare.mjs").then((mod) => mod.runComparison({ dataDir, config: aiConfig(), internacionFile })).then((result) => appendAudit(dataDir, { actor: "system", action: "ai_model_comparison", kind: "system", ok: result.ok, repetida: Boolean(result.repetida), motivo: result.motivo ?? null })).catch((error) => appendAudit(dataDir, { actor: "system", action: "ai_model_comparison_failed", kind: "system", error: String(error?.message ?? "error").slice(0, 80) })); }, 45_000).unref();

if (aiConfig().enabled) verifyOpenAi(aiConfig()).then((result) => writeJsonAtomic(resolve(dataDir, "ai", "status.json"), { ...result, at: new Date().toISOString() })).catch(() => undefined);
const stopSchedule = scheduleMailSync(mailRunner);
const stopWhatsAppDrafts = () => {}; // Sin programación automática de mensajes.
server.once("close", () => { stopSchedule(); stopWhatsAppDrafts(); photoIntake.stop(); waLink.stop(); });
server.listen(port, host, () => {
  process.stdout.write(`Hospital Schestakow listo en http://${host}:${port}\n`);
});
