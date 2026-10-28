import test from "node:test";
import assert from "node:assert/strict";
import { expiryFromMetaMessage, resetWhatsappTokenStatus, whatsappTokenStatus } from "./whatsapp-health.mjs";

const config = { accessToken: "x".repeat(40), phoneNumberId: "123", graphVersion: "v23.0" };
const reply = (status, body) => async () => ({ ok: status === 200, status, json: async () => body });

test("token vigente: devuelve el número emisor y no vuelve a consultar dentro de 10 minutos", async () => {
  resetWhatsappTokenStatus();
  let calls = 0;
  const fetchImpl = async (...args) => { calls++; return reply(200, { display_phone_number: "+54 9 260 405-6998", verified_name: "Hospital" })(...args); };
  const first = await whatsappTokenStatus(config, { fetchImpl, now: Date.parse("2026-10-18T10:00:00Z") });
  assert.equal(first.ok, true);
  assert.equal(first.number, "+54 9 260 405-6998");
  await whatsappTokenStatus(config, { fetchImpl, now: Date.parse("2026-10-18T10:05:00Z") });
  assert.equal(calls, 1);
  await whatsappTokenStatus(config, { fetchImpl, now: Date.parse("2026-10-18T10:11:00Z") });
  assert.equal(calls, 2);
});

test("token vencido (190/463): bloquea y da la fecha", async () => {
  resetWhatsappTokenStatus();
  const status = await whatsappTokenStatus(config, { fetchImpl: reply(400, { error: { code: 190, error_subcode: 463, message: "Error validating access token: Session has expired on Thursday, 02-Oct-26 08:00:00 PDT. The current time is Sunday, 18-Oct-26 15:00:00 PDT." } }) });
  assert.equal(status.ok, false);
  assert.equal(status.expired, true);
  assert.equal(status.expiredOn, "2026-10-02");
});

test("sin respuesta de Meta: no bloquea ni queda guardado", async () => {
  resetWhatsappTokenStatus();
  const status = await whatsappTokenStatus(config, { fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(status.ok, null);
  const again = await whatsappTokenStatus(config, { fetchImpl: reply(200, { display_phone_number: "1" }) });
  assert.equal(again.ok, true);
});

test("sin token cargado: no consulta", async () => {
  resetWhatsappTokenStatus();
  const status = await whatsappTokenStatus({ ...config, accessToken: "" }, { fetchImpl: async () => { throw new Error("no debería llamar"); } });
  assert.equal(status.code, "sin_configurar");
});

test("fecha de vencimiento ilegible: null", () => {
  assert.equal(expiryFromMetaMessage("otro texto"), null);
});
