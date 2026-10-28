import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveConsent, readConsents } from './whatsapp-consent.mjs';
import { queueOutbound, approveOutbound, deliverOutbound, readOutbox, serviceWindowStatus } from './whatsapp-send.mjs';
import { createMessagingWorkflow } from './messaging-workflow.mjs';
import { computeRouteWithGoogle } from './maps.mjs';
import { createHospitalServer } from './app.mjs';
import { issueSession } from './auth.mjs';
const secret = 's'.repeat(48), phone = '5492604604804';
const config = { accessToken: 'test-token', phoneNumberId: '123', graphVersion: 'v23.0' };
function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), 'guardia-security-'));
  mkdirSync(join(dataDir, 'whatsapp'));
  writeFileSync(join(dataDir, 'whatsapp/inbox.json'), JSON.stringify([{ remitente: phone, source: 'WHATSAPP_CLOUD_API', mensaje_en: new Date(Date.now() - 1000).toISOString() }]));
  return dataDir;
}
const consent = (d, active = true) => saveConsent(d, secret, { phone, active, evidence: 'Consentimiento explícito en fixture de pruebas' }, 'test');
function approved(d) { const r = queueOutbound(d, secret, { to: phone, kind: 'text', body: 'Prueba', motivo: 'test' }, 'test'); approveOutbound(d, secret, r.id, 'test'); return r; }
test('sin opt-in y después de revocación no se llama a Meta', async () => {
  const d = fixture(), r = approved(d); let calls = 0;
  const send = () => deliverOutbound({ dataDir: d, secret, id: r.id, config, fetchImpl: async () => { calls++; } });
  await assert.rejects(send, /consent_required/); consent(d); consent(d, false);
  await assert.rejects(send, /consent_required/); assert.equal(calls, 0);
  assert.equal(readConsents(d, secret)[0].active, false);
  assert.ok(!readFileSync(join(d, 'whatsapp/consents.enc.json'), 'utf8').includes(phone));
});
test('doble envío concurrente se bloquea y conserva borradores creados durante la red', async () => {
  const d = fixture(); consent(d); const r = approved(d); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const sending = deliverOutbound({ dataDir: d, secret, id: r.id, config, fetchImpl: async () => { await gate; return { ok: true, json: async () => ({ messages: [{ id: 'wamid.SECURITY' }] }) }; } });
  await assert.rejects(deliverOutbound({ dataDir: d, secret, id: r.id, config }), /send_in_progress/);
  const second = queueOutbound(d, secret, { to: phone, kind: 'text', body: 'Otro', motivo: 'test' }, 'test');
  release(); await sending;
  assert.equal(readOutbox(d, secret).length, 2);
  assert.ok(readOutbox(d, secret).some(item => item.id === second.id));
});
test('respuesta 200 sin identificador no cuenta como envío', async () => {
  const d = fixture(); consent(d); const r = approved(d);
  await assert.rejects(deliverOutbound({ dataDir: d, secret, id: r.id, config, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /whatsapp_send_502/);
  assert.equal(readOutbox(d, secret)[0].estado, 'FALLIDO');
});
test('un webhook atrasado o sin procedencia no abre ventana', () => {
  const d = fixture(); writeFileSync(join(d, 'whatsapp/inbox.json'), JSON.stringify([{ remitente: phone, recibido_en: new Date().toISOString(), source: 'WHATSAPP_CLOUD_API', mensaje_en: new Date(Date.now() - 25 * 3600000).toISOString() }, { remitente: phone, recibido_en: new Date().toISOString() }]));
  assert.equal(serviceWindowStatus(d, phone).open, false);
});
test('vista previa fija el contenido, exige confirmación y no se reutiliza', async () => {
  const d = fixture(); consent(d); const calls = [];
  const flow = createMessagingWorkflow({ dataDir: d, secret, config, fetchImpl: async (_u, init) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.PREVIEW' }] }) }; } });
  const p = flow.preview({ mode: 'selected', phone, body: 'Contenido revisado' }, 'direction');
  await assert.rejects(flow.confirm({ previewId: p.id, confirmed: false, recipientCount: 1 }, 'direction'), /confirmation_required/);
  await assert.rejects(flow.confirm({ previewId: p.id, confirmed: true, recipientCount: 1 }, 'another'), /preview_expired/);
  const result = await flow.confirm({ previewId: p.id, confirmed: true, recipientCount: 1, body: 'ALTERADO' }, 'direction');
  assert.equal(result.results[0].state, 'ENVIADO'); assert.equal(calls[0].text.body, 'Contenido revisado');
  await assert.rejects(flow.confirm({ previewId: p.id, confirmed: true, recipientCount: 1 }, 'direction'), /preview_expired/);
});
test('revocar después de revisar bloquea el lote completo', async () => {
  const d = fixture(); consent(d); let calls = 0;
  const flow = createMessagingWorkflow({ dataDir: d, secret, config, fetchImpl: async () => { calls++; } });
  const p = flow.preview({ mode: 'selected', phone, body: 'Prueba' }, 'direction'); consent(d, false);
  await assert.rejects(flow.confirm({ previewId: p.id, confirmed: true, recipientCount: 1 }, 'direction'), /consent_required/); assert.equal(calls, 0);
});
test('Routes valida entradas, conserva clave en backend y no inventa una ruta vacía', async () => {
  let calls = 0;
  const impl = async (_u, init) => { calls++; assert.equal(init.headers['X-Goog-Api-Key'], 'private-server-key'); return { ok: true, json: async () => ({ routes: [{ distanceMeters: 1200, duration: '180s', polyline: { encodedPolyline: 'abc' } }] }) }; };
  await assert.rejects(computeRouteWithGoogle({ origin: { lat: 999, lng: 2 }, destination: {} }, { serverKey: 'private-server-key' }, impl), /invalid_route_endpoint/); assert.equal(calls, 0);
  const r = await computeRouteWithGoogle({ origin: { lat: -34.6, lng: -68.3 }, destination: { lat: -34.61, lng: -68.34 } }, { serverKey: 'private-server-key' }, impl);
  assert.equal(r.durationSeconds, 180); assert.ok(!JSON.stringify(r).includes('private-server-key'));
});
test('API protege consentimiento, vista previa, rutas y datos clínicos por rol', async () => {
  const d = fixture(); mkdirSync(join(d, 'dist')); writeFileSync(join(d, 'dist/index.html'), 'app');
  const users = ['ADMIN', 'VIEWER', 'STAFF', 'COORDINATOR', 'DRIVER'].map(role => ({ id: role, role, name: role }));
  const authConfig = { secret, users, sessionHours: 1, secureCookie: false };
  const server = createHospitalServer({ dataDir: d, distDir: join(d, 'dist'), authConfig, waConfig: {}, maps: { browserKey: 'browser-key', serverKey: 'server-only-key' } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/api/bootstrap','/api/maps/config','/api/whatsapp/consents']) assert.equal((await fetch(base+path)).status,401);
    for (const user of users) {
      const headers = { cookie: 'sch_session=' + issueSession(user,authConfig), 'content-type': 'application/json' };
      const map = await fetch(base+'/api/maps/config',{headers});
      assert.equal(map.status, user.role==='ADMIN'?200:403);
      assert.ok(!(await map.text()).includes('server-only-key'));
      if (['VIEWER','STAFF','DRIVER'].includes(user.role)) {
        assert.equal((await fetch(base+'/api/boards',{headers})).status,403);
        assert.equal((await fetch(base+'/api/whatsapp/consents',{method:'POST',headers,body:'{}'})).status,403);
      }
      if (user.role==='VIEWER') { const boot=await (await fetch(base+'/api/bootstrap',{headers})).json(); assert.deepEqual(boot.internacion.beds,[]); }
      if (user.role==='COORDINATOR') assert.equal((await fetch(base+'/api/whatsapp/confirm',{method:'POST',headers,body:'{}'})).status,403);
      if (user.role==='ADMIN') assert.equal((await fetch(base+'/api/whatsapp/confirm',{method:'POST',headers:{...headers,origin:'https://attacker.example'},body:'{}'})).status,403);
    }
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('plantillas se consultan en Meta; contenido y parámetros quedan fijos en la vista previa', async () => {
  const d = fixture(); consent(d); writeFileSync(join(d, 'whatsapp/inbox.json'), '[]');
  const calls = [];
  const flow = createMessagingWorkflow({ dataDir:d, secret, config:{...config,businessAccountId:'waba-test'}, fetchImpl:async (url,init)=> {
    if (url.includes('/message_templates')) return {ok:true,json:async()=>({data:[{name:'aviso_test',status:'APPROVED',language:'es_AR',components:[{type:'BODY',text:'Hola {{1}}, confirmar {{2}}.'}]},{name:'sin_aprobar',status:'PENDING',language:'es_AR',components:[{type:'BODY',text:'No enviar'}]}]})};
    calls.push(JSON.parse(init.body)); return {ok:true,json:async()=>({messages:[{id:'wamid.TEMPLATE'}]})};
  }});
  assert.throws(()=>flow.preview({mode:'selected',phone,kind:'template',templateName:'aviso_test',languageCode:'es_AR',params:['Ana','turno']},'direction'),/template_not_verified/);
  assert.equal((await flow.templates()).items.length,1);
  const p=flow.preview({mode:'selected',phone,kind:'template',templateName:'aviso_test',languageCode:'es_AR',params:['Ana','turno']},'direction');
  assert.equal(p.body,'Hola Ana, confirmar turno.');assert.equal(p.recipients[0].windowOpen,false);
  const r=await flow.confirm({previewId:p.id,confirmed:true,recipientCount:1},'direction');
  assert.equal(r.results[0].state,'ENVIADO');assert.equal(calls[0].type,'template');assert.equal(calls[0].template.components[0].parameters[0].text,'Ana');
});

test('fotos de Cloud API entran al procesador con fecha original y sin turno inventado', async()=>{
  const {storedCaptures}=await import('./capture.mjs');const d=fixture();
  writeFileSync(join(d,'whatsapp/inbox.json'),JSON.stringify([{mensaje_id:'wamid.IMAGE',tipo:'image',source:'WHATSAPP_CLOUD_API',mensaje_en:'2026-10-20T10:00:00Z',recibido_en:'2026-10-24T10:00:00Z',hash:'abc',path:'fixture-image',estado:'A_CONFIRMAR'}]));
  const [p]=storedCaptures(d);assert.equal(p.foto_fecha,'2026-10-20T10:00:00Z');assert.equal(p.turno,null);assert.equal(p.fuente,'WHATSAPP_API');
});
