import { randomUUID } from 'node:crypto';
import { staffDirectory } from './staff-directory.mjs';
import { readStaffGroups } from './staff-groups.mjs';
import { readConsents, requireConsent } from './whatsapp-consent.mjs';
import { normalizeArgentinePhone, serviceWindowStatus, queueOutbound, approveOutbound, deliverOutbound } from './whatsapp-send.mjs';

// Las listas son internas: Cloud API envía un mensaje individual por persona.
// Ningún temporizador consume estas vistas previas ni las vuelve a intentar.
export function createMessagingWorkflow({ dataDir, secret, config, fetchImpl }) {
  const previews = new Map();
  let templates = []; let templatesAt = 0;
  return {
    async templates() {
      if (!config.businessAccountId || !config.accessToken) return { items: [], reason: "Falta el identificador de cuenta WhatsApp Business (WABA) o el token." };
      const response = await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.businessAccountId)}/message_templates?fields=name,status,language,components&limit=100`, { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(8000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { items: [], reason: "Meta no permitió consultar las plantillas aprobadas." };
      templates = (result.data ?? []).filter(t => t.status === "APPROVED" && t.components?.length === 1 && t.components[0].type === "BODY" && typeof t.components[0].text === "string").map(t => ({ name: t.name, language: t.language, body: t.components[0].text }));
      templatesAt = Date.now();
      return { items: templates, reason: "Se muestran hasta 100 plantillas aprobadas que contienen sólo texto, sin encabezados, medios ni botones." };
    },
    preview(input, actor) {
      for (const [id, value] of previews) if (value.expires < Date.now()) previews.delete(id);
      if (previews.size >= 100) throw new Error('invalid_preview');
      let body = String(input.body ?? '').trim();
      let payload = { kind: 'text', body };
      if (input.kind === 'template') {
        const template = templates.find(t => t.name === input.templateName && t.language === input.languageCode);
        if (!template || Date.now() - templatesAt > 5 * 60_000) throw new Error('template_not_verified');
        const params = Array.isArray(input.params) ? input.params.map(p => String(p).trim()) : [];
        const slots = [...template.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
        const count = slots.length ? Math.max(...slots) : 0;
        if (params.length !== count || count > 10 || params.some(p => !p || p.length > 1024 || /[\r\n\t]|\s{2,}/.test(p))) throw new Error('invalid_template_params');
        body = template.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n)-1]);
        if (/\{\{/.test(body)) throw new Error('invalid_template_params');
        payload = { kind: 'template', templateName: template.name, languageCode: template.language, params };
      }
      if (!body || body.length > 4000 || !['selected', 'all', 'groups'].includes(input.mode)) throw new Error('invalid_preview');
      const directory = staffDirectory(dataDir, secret);
      const ids = new Set(Array.isArray(input.staffIds) ? input.staffIds : []);
      if (input.mode === 'groups') for (const g of readStaffGroups(dataDir, secret)) {
        if (Array.isArray(input.groupIds) && input.groupIds.includes(g.id)) for (const id of g.memberIds) ids.add(id);
      }
      const candidates = directory.filter(p => input.mode === 'all' || ids.has(p.staffId)).map(p => ({ name: p.name, to: normalizeArgentinePhone(p.phone) }));
      if (input.mode === 'selected' && input.phone) candidates.push({ name: 'Número ingresado', to: normalizeArgentinePhone(input.phone) });
      const authorized = new Set(readConsents(dataDir, secret).filter(c => c.active).map(c => c.phone));
      const unique = [...new Map(candidates.filter(p => p.to).map(p => [p.to, p])).values()];
      const recipients = unique.filter(p => authorized.has(p.to)).map(p => ({ ...p, windowOpen: serviceWindowStatus(dataDir, p.to).open }));
      if (!recipients.length) throw new Error('no_authorized_recipients');
      const id = randomUUID();
      const preview = { id, body, payload, recipients, excluded: candidates.length - recipients.length, expires: Date.now() + 10 * 60_000, actor };
      previews.set(id, preview);
      return { ...preview, actor: undefined, maxPerHour: 200 };
    },
    async confirm(input, actor) {
      const p = previews.get(String(input.previewId));
      if (!p || p.actor !== actor || p.expires <= Date.now()) throw new Error('preview_expired');
      if (input.confirmed !== true || input.recipientCount !== p.recipients.length) throw new Error('confirmation_required');
      // Revalidar TODA la lista antes del primer envío y otra vez por destinatario.
      for (const r of p.recipients) requireConsent(dataDir, secret, r.to);
      previews.delete(p.id); // Consumir antes de esperar la red: un doble clic no reenvía.
      const results = [];
      for (const r of p.recipients) {
        try {
          if (p.payload.kind === 'text' && !serviceWindowStatus(dataDir, r.to).open) throw new Error('service_window_closed');
          const record = queueOutbound(dataDir, secret, { ...p.payload, to: r.to, motivo: 'Envío explícito desde vista previa' }, actor);
          approveOutbound(dataDir, secret, record.id, actor);
          const sent = await deliverOutbound({ dataDir, secret, id: record.id, config, fetchImpl });
          results.push({ ...r, state: sent.estado, id: sent.id });
        } catch (e) {
          results.push({ ...r, state: 'NO_ENVIADO', error: String(e.message).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 80) });
          if (['send_rate_limit', 'whatsapp_send_190', 'whatsapp_not_configured', 'send_in_progress'].includes(e.message)) break;
        }
      }
      return { results, pending: p.recipients.length - results.length };
    },
  };
}
