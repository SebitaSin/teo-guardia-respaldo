import { useState } from "react";
import { MONTHS_ES } from "@/data/catalog";
import { pauseClaim, saveClaimRecipients, type ClaimInfo } from "@/lib/live-catalog";

export function ClaimControls({ slug, name, claim, month, startsOn, enabled }: { slug: string; name: string; claim: ClaimInfo; month: string | null; startsOn?: string | null; enabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [year, monthNumber] = (month ?? "").split("-");
  const period = monthNumber ? `${MONTHS_ES[Number(monthNumber) - 1]} ${year}` : "el próximo mes";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const paused = claim.status === "cancelado";
  const stopped = claim.status === "recibida" || claim.status === "excluido";
  const summary = claim.status === "recibida" ? `Planilla de ${period} recibida. Reclamo detenido.`
    : paused ? `Reclamo de ${period} suspendido este mes`
    : !enabled ? "Reclamo automático desactivado"
    : startsOn && startsOn > today ? `Reclamo de ${period} desde el ${startsOn.split("-").reverse().join("/")}`
    : `Reclamo diario de ${period}${claim.sent ? ` · ${claim.sent} enviado(s)` : " · todavía sin enviar"}`;

  async function perform(action: () => Promise<boolean>) {
    setBusy(true); setError("");
    const ok = await action();
    setBusy(false);
    if (!ok) setError("No se pudo guardar. Revisá la conexión y los permisos de tu usuario.");
    else setEditing(false);
  }
  function save() {
    const to = draft.split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean);
    if (!to.length || to.length > 2 || to.some((value) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value))) {
      setError("Ingresá uno o dos correos completos, separados por coma."); return;
    }
    void perform(() => saveClaimRecipients(slug, to));
  }
  return (
    <section className="mt-2 border-t border-border px-3 py-2 text-xs text-muted" aria-label={`Reclamo de ${name}`}>
      <p>{summary}</p>
      <div className="mt-1 flex flex-wrap gap-x-3">
        <button type="button" disabled={busy || stopped} className="min-h-9 font-medium text-primary underline disabled:text-muted disabled:no-underline" onClick={() => void perform(() => pauseClaim(slug, !paused))}>{paused ? "Reanudar reclamo" : "Suspender reclamo"}</button>
        <button type="button" disabled={busy} className="min-h-9 font-medium text-primary underline" onClick={() => { setDraft(claim.to.join(", ")); setError(""); setEditing(!editing); }}>Cambiar datos</button>
      </div>
      {editing ? <div className="space-y-2 pb-1">
        <label className="block text-xs">Correo del responsable de {name}
          <input type="text" inputMode="email" autoComplete="off" autoFocus value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }} className="mt-1 min-h-11 w-full rounded-lg border bg-bg px-2 text-sm text-fg" />
        </label>
        <p>Podés indicar hasta dos correos separados por coma. Se usarán para los próximos reclamos de este servicio.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg" onClick={save}>{busy ? "Guardando…" : "Guardar correo"}</button>
          {claim.recipientSource === "manual" ? <button type="button" disabled={busy} className="min-h-10 px-2 underline" onClick={() => void perform(() => saveClaimRecipients(slug, null))}>Usar remitentes anteriores</button> : null}
          <button type="button" disabled={busy} className="min-h-10 px-2" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </div> : null}
      {error ? <p role="alert" className="mt-1 text-danger">{error}</p> : null}
    </section>
  );
}
