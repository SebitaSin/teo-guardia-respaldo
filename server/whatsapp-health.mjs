// Comprueba en Meta si el token de envío de WhatsApp sirve, SIN enviar ningún mensaje:
// pide los datos del número emisor. Así la pantalla avisa antes de que alguien escriba,
// y no recién al tocar Enviar. El resultado se guarda en memoria 10 minutos.

const TTL_MS = 10 * 60 * 1000;
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
let cache = null;
let pending = null;

/** "Session has expired on Thursday, 02-Oct-26 08:00:00 PDT" → "2026-10-02" (o null). */
export function expiryFromMetaMessage(message) {
  const found = String(message ?? "").match(/expired on \w+, (\d{2})-(\w{3})-(\d{2})/);
  if (!found || !MONTHS[found[2]]) return null;
  return `20${found[3]}-${String(MONTHS[found[2]]).padStart(2, "0")}-${found[1]}`;
}

async function check(config, fetchImpl, now) {
  const checkedAt = new Date(now).toISOString();
  try {
    const url = `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.phoneNumberId)}?fields=display_phone_number,verified_name`;
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(8_000) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      cache = { ok: true, number: String(body?.display_phone_number ?? ""), name: String(body?.verified_name ?? ""), checkedAt };
    } else {
      const error = body?.error ?? {};
      const code = Number(error.code ?? res.status);
      // Sólo 190 (token) y 10/200 (permisos) bloquean el envío; otro error queda "sin comprobar".
      const blocking = code === 190 || code === 10 || code === 200;
      cache = { ok: blocking ? false : null, code, subcode: error.error_subcode ?? null, expired: code === 190 && Number(error.error_subcode) === 463, expiredOn: expiryFromMetaMessage(error.message), checkedAt };
    }
  } catch {
    return { ok: null, code: "sin_respuesta", checkedAt };  // sin internet o Meta caído: no se guarda ni bloquea
  }
  return cache;
}

/** { ok: true | false | null, ... }. null = no se pudo comprobar (no bloquea el envío). */
export async function whatsappTokenStatus(config, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!config.accessToken || !config.phoneNumberId || !/^v\d+\.\d+$/.test(config.graphVersion)) return { ok: false, code: "sin_configurar", checkedAt: new Date(now).toISOString() };
  if (cache && now - Date.parse(cache.checkedAt) < TTL_MS) return cache;
  if (!pending) pending = check(config, fetchImpl, now).finally(() => { pending = null; });
  return pending;
}

export function resetWhatsappTokenStatus() {
  cache = null;
  pending = null;
}
