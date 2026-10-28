import { useEffect, useState } from "react";
import { syncIdentityMarks } from "@/lib/identidad";
import { syncCambios } from "@/lib/cambio-guardia";
import { catalogConnectivity, startLive } from "@/lib/live-catalog";

function isChunkFail(msg: string) {
  return /Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError|Importing a module script failed/i.test(
    msg,
  );
}

/** Sin cartel. Solo repara: www → dominio bueno, y recarga si un JS no carga. */
export function BootGuard() {
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    const update = () => setDegraded(catalogConnectivity() === 'degraded');
    window.addEventListener('schestakow-connectivity', update); update();
    return () => window.removeEventListener('schestakow-connectivity', update);
  }, []);
  useEffect(() => {
    void syncIdentityMarks();
    void syncCambios();
    const stopLive = startLive();
    const host = window.location.hostname;
    if (host.startsWith("www.")) {
      const bare = host.slice(4);
      window.location.replace(
        `https://${bare}${window.location.pathname}${window.location.search}`,
      );
      return;
    }

    const t = window.setTimeout(() => {
      try {
        sessionStorage.removeItem("schestakow-autoreload");
        sessionStorage.removeItem("schestakow-chunk");
      } catch {
        /* ignore */
      }
    }, 12000);

    const onError = (ev: ErrorEvent) => {
      if (!isChunkFail(String(ev.message))) return;
      try {
        if (sessionStorage.getItem("schestakow-chunk") === "1") return;
        sessionStorage.setItem("schestakow-chunk", "1");
      } catch {
        return;
      }
      window.location.reload();
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      if (!isChunkFail(String(ev.reason))) return;
      onError({ message: String(ev.reason) } as ErrorEvent);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      stopLive();
      window.clearTimeout(t);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  return degraded ? <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-warn-soft p-3 text-center text-sm text-warn">Sin actualización del servidor: se conserva la última información disponible. Verificá su fecha antes de usarla.</div> : null;
}
