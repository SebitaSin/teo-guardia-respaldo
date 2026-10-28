import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadGroups, loadMessagingDirectory, searchKey, whatsappNumber, type MessagingContact, type StaffGroup } from '@/lib/staff-directory';

export const Route = createFileRoute('/comunicaciones')({ component: CommunicationsPage });
type Consent = { phone: string; active: boolean; recordedAt: string };
type Preview = { id: string; body: string; payload: { kind: string }; recipients: { name: string; to: string; windowOpen: boolean }[]; excluded: number; maxPerHour: number };
type Flags = { canSend: boolean; canApprove: boolean; token?: { ok: boolean | null; code?: number | string; number?: string } };
const labels: Record<string, string> = {
  template_not_verified: 'La plantilla no está verificada o venció su consulta. Volvé a cargar las plantillas.',
  consent_required: 'Falta el consentimiento vigente del destinatario.',
  invalid_consent: 'Ingresá un celular válido y la referencia del consentimiento (10 a 500 caracteres).',
  no_authorized_recipients: 'La selección no tiene destinatarios con consentimiento registrado.',
  service_window_closed: 'Sin conversación entrante de las últimas 24 h. Requiere una plantilla aprobada en Meta.',
  preview_expired: 'La vista previa venció o ya se utilizó. Revisá de nuevo antes de enviar.',
  confirmation_required: 'Confirmá el número exacto de destinatarios.',
  whatsapp_send_190: 'El token de Meta venció.',
  send_rate_limit: 'Se alcanzó el límite de 200 mensajes por hora. No hay reintentos automáticos.',
  duplicate_send: 'Este mensaje ya fue enviado recientemente a este número.',
  forbidden: 'Esta acción requiere Dirección o Administración.',
};
const explain = (s: string) => labels[s] || s;
async function api(path: string, data?: unknown) {
  const r = await fetch(path, { ...(data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }) });
  const out = await r.json(); if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`); return out;
}
function CommunicationsPage() {
  const [people, setPeople] = useState<MessagingContact[]>([]);
  const [groups, setGroups] = useState<StaffGroup[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [flags, setFlags] = useState<Flags | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('selected');
  const [ids, setIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('text');
  const [templates, setTemplates] = useState<{ name: string; language: string; body: string }[]>([]);
  const [templateKey, setTemplateKey] = useState('');
  const [parameters, setParameters] = useState('');
  const [evidence, setEvidence] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<{ name: string; to: string; state: string; error?: string }[]>([]);
  const authorized = new Set(consents.filter(c => c.active).map(c => c.phone));
  const visible = people.filter(p => searchKey(`${p.name} ${p.service} ${p.phone}`).includes(searchKey(query)));
  async function refresh() {
    setLoading(true);
    try {
      await Promise.all([
        loadMessagingDirectory().then(setPeople), loadGroups().then(setGroups),
        api('/api/whatsapp/consents').then(c => setConsents(c.items)),
        api('/api/whatsapp/outbox').then(setFlags),
      ]);
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh().catch(e => setNotice(explain(e.message))); }, []);
  useEffect(() => { setPreview(null); setCount(''); }, [body, phone, ids, groupIds, mode, kind, templateKey, parameters]);
  async function run(fn: () => Promise<void>) {
    if (busy) return; setBusy(true); setNotice('');
    try { await fn(); } catch (e) { setNotice(explain((e as Error).message)); } finally { setBusy(false); }
  }
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  const field = 'w-full rounded-lg border border-border bg-bg p-3';
  return <div className="mx-auto max-w-6xl space-y-4">
    <h1 className="text-xl font-semibold">Comunicaciones por WhatsApp</h1>
    <p className="text-sm text-muted">Mensajes individuales y listas del hospital. Cada persona recibe su propio mensaje. No se envían alertas ni mensajes automáticamente.</p>
    <div className="rounded-lg bg-warn-soft p-3 text-sm" role="status">{flags?.canSend ? `Cuenta verificada: ${flags.token?.number || 'WhatsApp Business'}. Aceptado por Meta no significa entregado.` : flags?.token?.code === 190 ? 'Token de Meta vencido. El envío está bloqueado. Renovalo con CONFIGURAR-WHATSAPP.cmd en esta PC.' : 'Envío no habilitado o cuenta sin verificar. Podés revisar contactos y consentimientos.'} <button className="underline" disabled={busy} onClick={() => void run(refresh)}>Comprobar de nuevo</button></div>
    {loading && <p role="status">Cargando contactos y comprobando la cuenta…</p>}
    {notice && <p role="alert" className="rounded-lg bg-warn-soft p-3">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl bg-surface p-4">
        <h2 className="font-semibold">Destinatarios</h2>
        <select aria-label="Tipo de destinatarios" className={field} disabled={busy} value={mode} onChange={e => setMode(e.target.value)}><option value="selected">Individuales / selección</option><option value="groups">Grupos seleccionados</option><option value="all">Todos los autorizados</option></select>
        {mode === 'groups' && <div>{groups.map(g => <label className="block p-2" key={g.id}><input type="checkbox" disabled={busy} checked={groupIds.includes(g.id)} onChange={() => setGroupIds(toggle(groupIds, g.id))} /> {g.name} · {g.memberIds.length} integrantes</label>)}{!groups.length && <p>No hay listas guardadas. Seleccioná contactos para crear una.</p>}</div>}
        {mode === 'selected' && <>
          <input aria-label="Buscar contactos" className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, servicio o celular" />
          <div className="max-h-80 overflow-auto">{visible.map(p => { const n = whatsappNumber(p.phone || ''); const ok = Boolean(n && authorized.has(n)); return <label key={p.staffId} className="flex gap-2 border-b border-border p-2 text-sm"><input type="checkbox" disabled={busy || !ok} checked={ids.includes(p.staffId)} onChange={() => setIds(toggle(ids, p.staffId))} /><span>{p.name || 'Nombre sin cargar'} · {p.phone || 'Sin celular'}<small className="block text-muted">{p.service} · {ok ? 'Consentimiento registrado' : 'No habilitado: registrar consentimiento'}</small></span></label>; })}</div>
          <input aria-label="Número individual" className={field} disabled={busy} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Otro celular con consentimiento registrado" />
          <div className="flex gap-2"><input aria-label="Nombre de la lista" className={field} value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nombre de la lista" /><Button disabled={busy || !ids.length || !groupName.trim()} onClick={() => void run(async () => { await api('/api/personal/groups', { name: groupName, scope: 'MIXED', memberIds: ids }); await refresh(); setNotice('Lista guardada.'); })}>Guardar lista</Button></div>
        </>}
        {mode === 'all' && <p>La vista previa resolverá la nómina actual, excluirá celulares sin consentimiento y unificará números repetidos.</p>}
      </section>
      <section className="space-y-3 rounded-xl bg-surface p-4">
        <h2 className="font-semibold">Mensaje y revisión</h2>
        <select aria-label="Formato del mensaje" className={field} disabled={busy} value={kind} onChange={e => setKind(e.target.value)}><option value="text">Texto libre (ventana de 24 h)</option><option value="template">Plantilla aprobada por Meta</option></select>
        {kind === 'template' && <div className="space-y-2"><Button disabled={busy} onClick={() => void run(async () => { const out = await api('/api/whatsapp/templates'); setTemplates(out.items); setNotice(out.reason); setPreview(null); })}>Consultar plantillas aprobadas</Button><select aria-label="Plantilla" className={field} value={templateKey} onChange={e => setTemplateKey(e.target.value)}><option value="">Elegir plantilla…</option>{templates.map(t => <option key={t.name + ':' + t.language} value={t.name + ':' + t.language}>{t.name} · {t.language}</option>)}</select><p className="whitespace-pre-wrap text-sm">{templates.find(t => t.name + ':' + t.language === templateKey)?.body}</p><textarea aria-label="Parámetros de plantilla" className={field} value={parameters} onChange={e => setParameters(e.target.value)} placeholder="Un valor por línea, en el orden de los parámetros; vacío si no hay parámetros" /></div>}
        {kind === 'text' && <label className="block">Mensaje<textarea aria-label="Mensaje" className={field} disabled={busy} value={body} maxLength={4000} rows={5} onChange={e => setBody(e.target.value)} /></label>}
        <p className="text-xs text-muted">Texto libre sólo dentro de las 24 horas del último mensaje recibido por la API oficial. Fuera de esa ventana se necesita una plantilla aprobada; elegí el formato Plantilla aprobada por Meta y revisá el contenido completo.</p>
        <Button disabled={busy || !flags?.canApprove || (kind === 'text' ? !body.trim() : !templateKey)} onClick={() => void run(async () => { setPreview(await api('/api/whatsapp/preview', { mode, staffIds: ids, groupIds, phone, body, kind, templateName: templateKey.split(':')[0], languageCode: templateKey.split(':')[1], params: parameters.trim() ? parameters.split('\n') : [] })); setResults([]); })}>Revisar destinatarios y mensaje</Button>
        {!loading && !flags?.canApprove && <p className="text-sm">La vista previa y el envío requieren Dirección o Administración.</p>}
        {preview && <div className="space-y-3 rounded-lg border border-border p-3">
          <h3 className="font-semibold">Vista previa · {preview.recipients.length} destinatarios únicos</h3>
          <p className="whitespace-pre-wrap rounded bg-bg p-3">{preview.body}</p>
          <ul className="max-h-64 overflow-auto text-sm">{preview.recipients.map(r => <li className="py-1" key={r.to}>{r.name} · +{r.to} · {preview.payload.kind === 'template' ? 'Plantilla aprobada consultada en Meta' : r.windowOpen ? 'Ventana abierta' : 'No se enviará: necesita plantilla'}</li>)}</ul>
          <p className="text-xs">{preview.excluded} registros excluidos o duplicados. Tope: 200 por hora. Los pendientes requieren una nueva acción; no se reintentan solos.</p>
          <label className="block text-sm">Para confirmar, escribí {preview.recipients.length}<input aria-label="Cantidad confirmada" disabled={busy} className={field} inputMode="numeric" value={count} onChange={e => setCount(e.target.value)} /></label>
          <Button disabled={busy || !flags?.canSend || count !== String(preview.recipients.length) || (preview.payload.kind !== 'template' && !preview.recipients.some(r => r.windowOpen))} onClick={() => void run(async () => { const out = await api('/api/whatsapp/confirm', { previewId: preview.id, confirmed: true, recipientCount: Number(count) }); setResults(out.results); setPreview(null); setCount(''); setNotice(out.pending ? `${out.pending} destinatarios pendientes. No se programó ningún reintento.` : 'Proceso finalizado. Revisá el resultado de cada destinatario.'); })}>{busy ? 'Procesando…' : 'Confirmar envío explícito'}</Button>
        </div>}
        {results.length > 0 && <ul className="text-sm">{results.map(r => <li key={r.to}>{r.name} · +{r.to}: {r.state === 'ENVIADO' ? 'Aceptado por Meta; entrega pendiente' : explain(r.error || r.state)}</li>)}</ul>}
      </section>
    </div>
    {flags?.canApprove && <details className="rounded-xl bg-surface p-4"><summary className="cursor-pointer font-semibold">Registrar consentimiento o baja</summary><p className="my-2 text-sm">Registrar sólo una autorización obtenida realmente. Tener el teléfono en la nómina no equivale a consentimiento. La baja bloquea también mensajes previamente preparados.</p><input aria-label="Celular para consentimiento" className={field} disabled={busy} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Celular" /><textarea aria-label="Evidencia del consentimiento" className={`${field} my-2`} disabled={busy} value={evidence} maxLength={500} onChange={e => setEvidence(e.target.value)} placeholder="Fecha, canal y referencia verificable de la autorización o baja" /><div className="flex gap-2">{[true, false].map(active => <Button key={String(active)} disabled={busy || evidence.trim().length < 10 || !phone.trim()} onClick={() => void run(async () => { await api('/api/whatsapp/consents', { phone, active, evidence }); setPreview(null); await refresh(); setNotice(active ? 'Consentimiento registrado.' : 'Baja registrada.'); })}>{active ? 'Registrar autorización' : 'Registrar baja'}</Button>)}</div></details>}
  </div>;
}
