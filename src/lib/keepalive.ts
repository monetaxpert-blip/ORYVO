"use client";

// Sur iOS, une PWA est suspendue quand l'écran se verrouille — SANS exception.
// La seule manière de rester actif en arrière-plan : une piste audio en cours.
// Un son à 32 Hz à volume quasi nul (-44 dBFS, inaudible) maintient le pipeline
// audio actif, ce qui permet à watchPosition de continuer à recevoir les fixes GPS
// pendant que l'écran est verrouillé. Démarré dans un geste utilisateur (bouton).
let ctx: AudioContext | null = null;
let running = false;

export function startKeepAlive(): void {
  if (running || typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    void ctx.resume().catch(() => undefined);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 32;
    gain.gain.value = 0.006;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Séance en cours", artist: "ORYVO", album: "Suivi GPS" });
        navigator.mediaSession.playbackState = "playing";
      } catch { /* métadonnées en effort de bonne foi */ }
    }
    running = true;
  } catch { /* non supporté : le suivi continue au premier plan uniquement */ }
}

export function stopKeepAlive(): void {
  if (!running) return;
  running = false;
  try { void ctx?.close().catch(() => undefined); } catch { /* noop */ }
  try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; } catch { /* noop */ }
  ctx = null;
}
