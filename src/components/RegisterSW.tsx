"use client";

import { useEffect, useState } from "react";
import { startSyncEngine } from "@/lib/sync";

export default function RegisterSW() {
  const [failed, setFailed] = useState(false);
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    startSyncEngine();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let alive = true;
    const hadController = !!navigator.serviceWorker.controller;
    const message = (event: MessageEvent) => {
      if (!alive) return;
      if (event.data?.type === "OFFLINE_ERROR") setFailed(true);
      if (event.data?.type === "OFFLINE_READY") { setFailed(false); window.dispatchEvent(new CustomEvent("oryvo:offline-ready")); }
    };
    const changed = () => { if (alive && hadController) setUpdated(true); };
    const prepare = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await registration.update();
        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({ type: "PREPARE_OFFLINE" });
      } catch { if (alive && navigator.onLine) setFailed(true); }
    };
    navigator.serviceWorker.addEventListener("message", message);
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    window.addEventListener("online", prepare);
    void prepare();
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("message", message);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      window.removeEventListener("online", prepare);
    };
  }, []);
  if (!failed && !updated) return null;
  return <div role="status" className="fixed left-1/2 top-2 z-[95] flex w-[calc(100%-24px)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-flame/30 bg-coal px-4 py-3 text-xs shadow-lg"><p className="flex-1 text-white/75">{failed ? "Mode hors ligne pas encore prêt. Gardez le réseau et rechargez après votre séance." : "Mise à jour prête. Elle sera utilisée au prochain chargement ; votre séance n’est pas interrompue."}</p><button type="button" aria-label="Fermer le message" onClick={() => { setFailed(false); setUpdated(false); }} className="p-1 text-flare">✕</button></div>;
}
