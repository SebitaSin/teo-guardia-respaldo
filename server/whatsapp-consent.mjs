import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './store.mjs';

function phoneKey(value) {
  let n = String(value ?? '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (/^54\d{10}$/.test(n)) n = '549' + n.slice(2);
  if (/^\d{10}$/.test(n)) n = '549' + n;
  if (!/^549\d{10}$/.test(n)) throw new Error('invalid_consent');
  return n;
}
function key(secret) {
  if (String(secret).length < 32) throw new Error('invalid_consent');
  return createHash('sha256').update('wa-consent:' + secret).digest();
}
export function readConsents(dataDir, secret) {
  const path = join(dataDir, 'whatsapp', 'consents.enc.json');
  if (!existsSync(path)) return [];
  const box = JSON.parse(readFileSync(path, 'utf8'));
  const c = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(box.iv, 'base64'));
  c.setAuthTag(Buffer.from(box.tag, 'base64'));
  return JSON.parse(Buffer.concat([c.update(Buffer.from(box.data, 'base64')), c.final()]).toString());
}
export function saveConsent(dataDir, secret, input, actor) {
  const phone = phoneKey(input.phone);
  const evidence = String(input.evidence ?? '').trim();
  if (typeof input.active !== 'boolean' || evidence.length < 10 || evidence.length > 500 || !actor) throw new Error('invalid_consent');
  const records = readConsents(dataDir, secret);
  const consent = { phone, active: input.active, evidence, recordedBy: actor, recordedAt: new Date().toISOString() };
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const data = Buffer.concat([c.update(JSON.stringify([...records.filter(r => r.phone !== phone), consent])), c.final()]);
  writeJsonAtomic(join(dataDir, 'whatsapp', 'consents.enc.json'), { version: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
  return consent;
}
export function requireConsent(dataDir, secret, phone) {
  if (!readConsents(dataDir, secret).some(r => r.phone === phoneKey(phone) && r.active === true)) throw new Error('consent_required');
}
