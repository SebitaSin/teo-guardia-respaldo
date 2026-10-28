// Los datos privados se cargan después de autenticar, nunca dentro del JS distribuido.
async function boot() {
  const res = await fetch('/api/bootstrap', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (res.status === 401) { location.assign('/login'); return; }
  if (!res.ok) throw new Error('bootstrap_unavailable');
  (globalThis as any).__GUARDIA_DATA__ = await res.json();
  await import('./app-entry');
}
void boot().catch(() => {
  const root = document.getElementById('root');
  if (root) root.textContent = 'No se pudieron cargar los datos privados. Comprobá la conexión y recargá la página.';
});
