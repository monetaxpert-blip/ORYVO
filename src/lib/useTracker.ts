"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { caloriesFor } from "./geo";
import { clearPendingActivities, clearSessionMirror, commitActivity, idbGetActivity, idbPutActivity, kvGet, kvSet, mirrorSession, pendingAppendActivity, readPendingActivities, readSessionMirror, type SessionSnapshot } from "./idb";
import { defaultActivityName } from "./format";
import { SPORT_LABEL, type ActivityRecord, type SportType, type TrackPoint } from "./types";
import { SIGNAL_TIMEOUT_MS, TrackerEngine, type TrackerStatus } from "./tracker-engine";
import { startKeepAlive, stopKeepAlive } from "./keepalive";
export type { TrackerStatus } from "./tracker-engine";
export type GpsQuality = "search" | "excellent" | "good" | "weak" | "lost";
export interface LiveStats { distanceM: number; elapsedSec: number; speed: number; avgSpeed: number; paceSecKm: number; calories: number }
const ZERO: LiveStats = { distanceM: 0, elapsedSec: 0, speed: 0, avgSpeed: 0, paceSecKm: 0, calories: 0 };
const SESSION_KEY = "oryvo:session";

export function useTracker(weightKg: number, autoPauseEnabled: boolean) {
  const engine = useRef(new TrackerEngine());
  const options = useRef({ weightKg, autoPauseEnabled });
  options.current = { weightKg, autoPauseEnabled };
  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [sport, setSportState] = useState<SportType>("run");
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [live, setLive] = useState<{ lat: number; lng: number; acc: number | null } | null>(null);
  const [quality, setQuality] = useState<GpsQuality>("search");
  const [permissionError, setPermissionError] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [lockReady, setLockReady] = useState(false);
  const [busyElsewhere, setBusyElsewhere] = useState(false);
  const [stats, setStats] = useState<LiveStats>(ZERO);
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const finishing = useRef<Promise<ActivityRecord> | null>(null);
  const mounted = useRef(true);
  const ownsSession = useRef(false);
  const lastRenderedLength = useRef(-1);

  const publish = useCallback(() => {
    if (!mounted.current) return;
    const e = engine.current;
    const elapsed = e.elapsed(Date.now()) / 1000;
    const avgSpeed = elapsed > 0 ? e.distanceM / elapsed : 0;
    setStatus(e.status);
    setSportState(e.sport);
    if (lastRenderedLength.current !== e.points.length) {
      lastRenderedLength.current = e.points.length;
      setPoints(e.points.slice());
    }
    setStats({ distanceM: e.distanceM, elapsedSec: elapsed, speed: e.speed, avgSpeed,
      paceSecKm: avgSpeed > 0 ? 1000 / avgSpeed : 0,
      calories: caloriesFor(e.sport, options.current.weightKg, e.distanceM, elapsed, avgSpeed) });
  }, []);

  // Priorité des messages : le plus significatif l'emporte, sans affichage instable.
  const msgRank = useRef(0);
  const raiseStorageError = useCallback((msg: string, rank: number) => {
    if (rank < msgRank.current) return;
    msgRank.current = rank;
    setStorageError(msg);
  }, []);
  const persist = useCallback(() => {
    const e = engine.current;
    if (!ownsSession.current || !["tracking", "paused", "autopaused"].includes(e.status)) return pending.current;
    const snapshot = e.snapshot(Date.now());
    // Miroir synchrone et immédiat : même si IndexedDB est bloqué (navigation
    // privée, gel iOS), la séance survit à la fermeture/actualisation.
    mirrorSession(snapshot);
    const work = pending.current.catch(() => undefined).then(() => kvSet(SESSION_KEY, snapshot));
    pending.current = work;
    void work.catch(() => {
      if (!mounted.current) return;
      raiseStorageError("Sauvegarde principale indisponible : la sauvegarde de secours conserve la séance.", 1);
    });
    return work;
  }, [raiseStorageError]);

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLock.current;
    wakeLock.current = null;
    void lock?.release().catch(() => undefined);
  }, []);
  const requestWakeLock = useCallback(async () => {
    if (wakeLock.current && !wakeLock.current.released) return;
    try {
      const lock = await navigator.wakeLock?.request("screen");
      if (lock && (!mounted.current || engine.current.status !== "tracking")) { await lock.release(); return; }
      wakeLock.current = lock ?? null;
    } catch { /* Unsupported or refused: the UI explains the foreground requirement. */ }
  }, []);

  const storageSafetyFired = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let unlock: (() => void) | undefined;
    const initialize = async () => {
      if (navigator.locks) {
        void navigator.locks.request("oryvo-recording-v2", { ifAvailable: true }, async (lock) => {
          if (cancelled) return;
          if (!lock) { setBusyElsewhere(true); setLockReady(false); return; }
          ownsSession.current = true;
          setLockReady(true);
          await new Promise<void>((resolve) => { unlock = resolve; });
        }).catch(() => { if (!cancelled) setBusyElsewhere(true); });
      } else { ownsSession.current = true; setLockReady(true); }
      try {
        // Trois tentatives : la première ouverture à froid sur mobile peut
        // être lente, et un échec transitoire ne doit jamais bloquer l'app.
        let stored = false;
        for (let attempt = 0; attempt < 3 && !stored; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
          if (cancelled) return;
          try { await kvSet("oryvo:storage-check", Date.now()); stored = true; } catch { /* tentative suivante */ }
        }
        if (!stored) throw new Error("stockage indisponible");
        let snapshot = await kvGet<SessionSnapshot>(SESSION_KEY);
        if (cancelled) return;
        // Repli : si IndexedDB n'a pas la séance, le miroir localStorage la garde.
        if (!snapshot) snapshot = readSessionMirror<SessionSnapshot>();
        if (snapshot?.startTs && ["tracking", "paused", "autopaused", "finished"].includes(snapshot.status)) {
          const committed = snapshot.id ? await idbGetActivity(snapshot.id) : null;
          if (cancelled) return;
          if (!committed) {
            engine.current.restore(snapshot, crypto.randomUUID());
            lastRenderedLength.current = -1;
            setRestored(true);
            publish();
          }
        }
        // Réintégrer les activités gardées en file de secours dans IndexedDB.
        const pendingList = readPendingActivities();
        if (pendingList.length) {
          let all = true;
          for (const item of pendingList) {
            try { await idbPutActivity(item); } catch { all = false; break; }
          }
          if (all) clearPendingActivities();
        }
        setStorageReady(true);
        // Le stockage a répondu : on lève l'avertissement du filet de sécurité s'il était parti.
        if (storageSafetyFired.current) {
          storageSafetyFired.current = false;
          if (msgRank.current <= 1) {
            msgRank.current = 0;
            setStorageError(null);
          }
        }
      } catch {
        if (!cancelled) raiseStorageError("Stockage local inaccessible : la séance reste protégée en mémoire et en sauvegarde de secours. Autorisez les données de site pour un stockage complet.", 2);
      }
    };
    void initialize();
    // Filets de sécurité iOS : navigator.locks ou IndexedDB peuvent se figer
    // SANS émettre aucun événement (navigation privée, gel du système).
    // Plutôt que de rester figé sur « Vérification du stockage… », on continue :
    // l'enregistrement reste possible, avec un avertissement clair.
    const lockSafety = setTimeout(() => {
      if (!cancelled && !ownsSession.current) { ownsSession.current = true; setLockReady(true); }
    }, 4000);
    const storageSafety = setTimeout(() => {
      if (cancelled) return;
      storageSafetyFired.current = true;
      setStorageReady(true);
      raiseStorageError("Stockage principal non confirmé pour l'instant : la séance est protégée par la sauvegarde de secours, l'enregistrement reste possible.", 1);
    }, 14000);
    return () => {
      clearTimeout(lockSafety);
      clearTimeout(storageSafety);
      cancelled = true;
      mounted.current = false;
      void persist().catch(() => undefined);
      releaseWakeLock();
      stopKeepAlive();
      ownsSession.current = false;
      unlock?.();
    };
  }, [persist, publish, releaseWakeLock]);

  // Le GPS démarre DÈS QUE POSSIBLE, indépendamment de l'état du stockage :
  // une lenteur d'IndexedDB ne doit jamais retarder la recherche de position.
  useEffect(() => {
    if (!lockReady || busyElsewhere) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setPermissionError(true);
      setLocationMessage("Le GPS nécessite un navigateur compatible et une adresse HTTPS.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition((position) => {
      const c = position.coords;
      const point: TrackPoint = {
        lat: c.latitude, lng: c.longitude, t: position.timestamp || Date.now(),
        acc: c.accuracy, alt: c.altitude != null && Number.isFinite(c.altitude) && Math.abs(c.altitude) <= 15000 ? c.altitude : null,
        spd: c.speed != null && Number.isFinite(c.speed) && c.speed >= 0 && c.speed <= 200 ? c.speed : null,
        seg: engine.current.segment,
      };
      // Jusqu'à 60 m d'incertitude restent exploitables (courant en ville) ;
      // le filtre de vitesse du moteur écarte ensuite les sauts de précision.
      if (c.accuracy > 60) { setQuality("weak"); return; }
      const before = engine.current.status;
      if (!engine.current.ingest(point, Date.now(), options.current.autoPauseEnabled)) return;
      setPermissionError(false);
      setLocationMessage(null);
      setQuality(c.accuracy <= 8 ? "excellent" : c.accuracy <= 20 ? "good" : "weak");
      setLive({ lat: point.lat, lng: point.lng, acc: point.acc ?? null });
      if (before !== engine.current.status) {
        if (engine.current.status === "tracking") void requestWakeLock();
        void persist().catch(() => undefined);
      }
      publish();
    }, (error) => {
      setQuality("lost");
      if (error.code === 1) {
        setPermissionError(true);
        setLocationMessage(window.top !== window.self
          ? "La prévisualisation ou le navigateur bloque la localisation. Ouvrez ORYVO dans un onglet, puis autorisez le GPS."
          : "La localisation est refusée. Autorisez-la dans les réglages du site, puis réessayez.");
      } else {
        setLocationMessage(error.code === 3 ? "Le GPS met du temps à répondre. Placez-vous à l'extérieur ; la recherche continue." : "Position indisponible. Vérifiez que la localisation de votre appareil est activée.");
      }
    }, { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [lockReady, busyElsewhere, gpsAttempt, persist, publish, requestWakeLock]);

  useEffect(() => {
    const tick = setInterval(() => {
      const e = engine.current;
      const before = e.status;
      e.tick(Date.now(), options.current.autoPauseEnabled);
      if (e.lastFix && Date.now() - e.lastFix.t > SIGNAL_TIMEOUT_MS) setQuality("lost");
      if (before !== e.status) void persist().catch(() => undefined);
      publish();
    }, 500);
    // Le miroir de secours est écrit même si le stockage principal est bloqué.
    const save = setInterval(() => { if (lockReady) void persist().catch(() => undefined); }, 2000);
    const visibility = () => {
      void persist().catch(() => undefined);
      if (document.visibilityState === "visible" && engine.current.status === "tracking") void requestWakeLock();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      void persist().catch(() => undefined);
      if (engine.current.status === "tracking") { event.preventDefault(); event.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", visibility);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearInterval(tick); clearInterval(save);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", visibility);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [persist, publish, requestWakeLock, lockReady]);

  // Le stockage ne bloque plus le départ : la sauvegarde de secours couvre la séance.
  const canStart = lockReady && !busyElsewhere && !permissionError && !!engine.current.lastFix && Date.now() - engine.current.lastFix.t < SIGNAL_TIMEOUT_MS;
  const start = useCallback(() => {
    if (!lockReady || permissionError || !engine.current.lastFix || Date.now() - engine.current.lastFix.t >= SIGNAL_TIMEOUT_MS) return;
    // DOIT se faire dans le geste utilisateur (clic) pour iOS.
    startKeepAlive();
    engine.current.start(crypto.randomUUID(), Date.now());
    lastRenderedLength.current = -1;
    setRestored(false);
    publish();
    void requestWakeLock();
    void persist().catch(() => undefined);
    void navigator.storage?.persist?.().catch(() => false);
  }, [storageReady, lockReady, permissionError, persist, publish, requestWakeLock]);

  const pause = useCallback((auto = false) => {
    engine.current.pause(Date.now(), auto); publish();
    void persist().catch(() => undefined);
  }, [persist, publish]);
  const resume = useCallback(() => {
    if (permissionError || busyElsewhere) return;
    startKeepAlive();
    engine.current.resume(Date.now()); publish();
    void requestWakeLock();
    void persist().catch(() => undefined);
  }, [permissionError, busyElsewhere, persist, publish, requestWakeLock]);

  const finish = useCallback((): Promise<ActivityRecord> => {
    if (finishing.current) return finishing.current;
    if (!ownsSession.current || !engine.current.id) return Promise.reject(new Error("Aucune séance active sur cet onglet."));
    const operation = async () => {
      const e = engine.current;
      e.pause(Date.now());
      publish();
      const record = e.record(defaultActivityName(SPORT_LABEL[e.sport], e.startTs), Date.now(), options.current.weightKg);
      await pending.current.catch(() => undefined);
      try {
        await commitActivity({ ...record, synced: false, revision: 1 });
        clearSessionMirror();
        msgRank.current = 0;
        setStorageError(null);
      } catch {
        // Repli garanti : l'activité est conservée dans la file de secours
        // (localStorage) et migrée vers IndexedDB dès que le stockage répond.
        pendingAppendActivity({ ...record, synced: false, revision: 1 });
        clearSessionMirror();
        raiseStorageError("Activité conservée dans la sauvegarde de secours : le stockage principal n'a pas répondu. Elle sera réintégrée automatiquement.", 3);
      }
      e.finish(Date.now());
      releaseWakeLock();
      stopKeepAlive();
      publish();
      return record;
    };
    const work = operation().catch((error) => {
      raiseStorageError("Erreur inattendue pendant la sauvegarde. La séance reste en pause : réessayez.", 3);
      throw error;
    }).finally(() => { finishing.current = null; });
    finishing.current = work;
    return work;
  }, [publish, releaseWakeLock]);

  const discard = useCallback(async () => {
    await pending.current.catch(() => undefined);
    await kvSet(SESSION_KEY, null);
    const previous = engine.current;
    const fresh = new TrackerEngine();
    fresh.sport = previous.sport;
    fresh.lastFix = previous.lastFix;
    if (fresh.lastFix) fresh.status = "ready";
    engine.current = fresh;
    lastRenderedLength.current = -1;
    setRestored(false);
    msgRank.current = 0;
    setStorageError(null);
    releaseWakeLock();
    stopKeepAlive();
    publish();
  }, [publish, releaseWakeLock]);
  const setSport = useCallback((value: SportType) => {
    if (!["idle", "ready"].includes(engine.current.status)) return;
    engine.current.sport = value; publish();
  }, [publish]);
  const retryGps = () => { setPermissionError(false); setLocationMessage(null); setQuality("search"); setGpsAttempt((n) => n + 1); };

  return { status, sport, setSport, points, live, quality, permissionError, locationMessage, storageError,
    restored, stats, start, pause, resume, finish, discard, canStart, storageReady, busyElsewhere, retryGps };
}
