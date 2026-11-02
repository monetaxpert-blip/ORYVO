"use client";

import { Check, ChevronLeft, ExternalLink, Flag, Pause, Play, RefreshCw, RotateCcw, Share2, ShieldCheck, SignalHigh, Trash2, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "@/components/AppLink";
import { useEffect, useState } from "react";
import { SPORT_ICON, Sheet, Stat } from "@/components/bits";
import { fmtClock, fmtKm, fmtPace, fmtSpeed } from "@/lib/format";
import { idbMutateActivity } from "@/lib/idb";
import { useProfile } from "@/lib/profile";
import { shareActivity } from "@/lib/share";
import { deleteActivitySmart, syncNow } from "@/lib/sync";
import { SPORT_LABEL, type ActivityRecord, type SportType } from "@/lib/types";
import { useTracker, type GpsQuality } from "@/lib/useTracker";
import { useSyncState } from "@/lib/useSyncState";

function MapLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(t); }, []);
  return <div className="grid h-full place-items-center px-8 text-center text-xs leading-relaxed text-white/40">
    {slow ? <>Carte indisponible pour l'instant{navigator.onLine ? "" : " (hors ligne)"}.<br />Le suivi GPS fonctionne normalement sans la carte.</> : "Préparation de la carte…"}
  </div>;
}
const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false, loading: () => <MapLoading /> });
const SPORTS: SportType[] = ["run", "walk", "ride", "hike"];
const QUALITY_UI: Record<GpsQuality, { label: string; color: string }> = {
  search: { label: "Recherche GPS", color: "text-amber-300" },
  excellent: { label: "GPS excellent", color: "text-emerald-300" },
  good: { label: "GPS bon", color: "text-emerald-300" },
  weak: { label: "GPS imprécis", color: "text-amber-300" },
  lost: { label: "Signal perdu", color: "text-red-300" },
};

export default function RecordPage() {
  const [profile] = useProfile();
  const t = useTracker(profile.weightKg, profile.autoPause);
  const sync = useSyncState();
  const [saved, setSaved] = useState<ActivityRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const tracking = t.status === "tracking";
  const paused = t.status === "paused" || t.status === "autopaused";
  const warmup = t.status === "idle" || t.status === "ready";
  const finished = t.status === "finished";
  const ride = t.sport === "ride";
  const q = QUALITY_UI[t.quality];

  const finish = async () => {
    if (saving) return;
    setSaving(true); setNotice(null);
    try { const record = await t.finish(); setSaved(record); void syncNow(); }
    catch { setNotice("Sauvegarde non terminée. Votre séance est conservée en pause ; réessayez."); }
    finally { setSaving(false); }
  };
  const rename = async (value: string) => {
    const name = value.trim();
    if (!saved || !name || name === saved.name) return;
    try {
      await idbMutateActivity(saved.id, (current) => current && !current.deleted ? { ...current, name, synced: false, revision: (current.revision ?? 0) + 1 } : undefined);
      setSaved({ ...saved, name }); void syncNow();
    } catch { setNotice("Le nom n'a pas pu être sauvegardé. Réessayez."); }
  };
  const share = async () => {
    if (!saved || sharing) return;
    setSharing(true);
    try { const result = await shareActivity(saved); if (result === "downloaded") setNotice("Carte de performance téléchargée."); }
    catch { setNotice("Partage indisponible. Réessayez depuis le détail de l'activité."); }
    finally { setSharing(false); }
  };
  const discard = async () => {
    try {
      if (saved) await deleteActivitySmart(saved.id);
      await t.discard(); setSaved(null); setConfirmDelete(false); setNotice(null);
    } catch { setNotice("Suppression non effectuée. Réessayez."); }
  };

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-ink" data-testid="recorder">
      <header className="relative z-20 shrink-0 border-b border-white/10 bg-ink px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!tracking && !saving ? <Link href="/" aria-label="Retour à l'accueil" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10"><ChevronLeft size={20} /></Link> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-flame/10"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-flame" /></span>}
            <div><p className="font-display text-sm font-black italic tracking-widest">ORY<span className="text-flare">VO</span></p><p className="text-[9px] uppercase tracking-widest text-white/45">{finished ? "Votre performance" : tracking ? "Enregistrement" : paused ? "Séance en pause" : "À vous de jouer"}</p></div>
          </div>
          <div className="text-right"><p className={`flex items-center justify-end gap-1.5 text-[10px] font-bold ${q.color}`}><SignalHigh size={14} />{q.label}</p><p className="mt-0.5 text-[10px] text-white/40">{t.live?.acc != null ? `Précision ±${Math.round(t.live.acc)} m` : "Localisation haute précision"}</p></div>
        </div>
      </header>

      {/* A separate stacking context AND a separate layout area: Leaflet never covers buttons. */}
      <div className="relative isolate z-0 min-h-0 flex-1">
        <RouteMap points={t.points} live={finished ? null : t.live} follow={tracking} fitKey={saved?.id ?? (t.restored ? "recovered" : "live")} />
      </div>

      <section className="relative z-20 max-h-[72dvh] shrink-0 overflow-y-auto border-t border-white/10 bg-coal px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 sm:px-6" aria-label="Commandes d'enregistrement">
        <div className="mx-auto w-full max-w-lg">
          {(t.storageError || t.busyElsewhere || t.locationMessage || notice) && <div role="alert" className="mb-3 rounded-xl border border-flame/25 bg-flame/10 px-3 py-2.5 text-xs leading-relaxed text-orange-100">
            <p className="flex items-start gap-2"><TriangleAlert size={16} className="mt-0.5 shrink-0 text-flare" />{t.busyElsewhere ? "Une séance est déjà ouverte dans un autre onglet. Revenez à cet onglet ou fermez-le, puis rechargez cette page." : t.storageError || notice || t.locationMessage}</p>
            {t.permissionError && <div className="mt-2 flex flex-wrap gap-4"><button type="button" onClick={t.retryGps} className="flex items-center gap-1.5 font-bold text-flare"><RefreshCw size={13} />Réessayer le GPS</button><a href="/record" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-bold text-white"><ExternalLink size={13} />Ouvrir dans un onglet</a></div>}
          </div>}
          {t.restored && paused && <p className="mb-3 flex items-center gap-2 text-xs text-flare"><RotateCcw size={14} />Séance récupérée. Le temps de fermeture est exclu.</p>}
          {t.status === "autopaused" && <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-flare"><Pause size={14} />Pause automatique · reprise dès que vous repartez.</p>}
          {tracking && t.quality === "lost" && <p className="mb-3 text-xs text-amber-200">Signal GPS perdu. Recherche en cours ; aucun trajet artificiel ne sera ajouté.</p>}

          {warmup && <>
            <div className="mb-4 grid grid-cols-4 gap-2">{SPORTS.map((sport) => {
              const Icon = SPORT_ICON[sport];
              return <button type="button" key={sport} onClick={() => t.setSport(sport)} aria-pressed={t.sport === sport} className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-[10px] font-bold transition-colors ${t.sport === sport ? "border-flame/60 bg-flame/15 text-flare" : "border-white/10 bg-white/[0.03] text-white/50"}`}><Icon size={20} />{SPORT_LABEL[sport]}</button>;
            })}</div>
            <button type="button" onClick={t.start} disabled={!t.canStart} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-flare to-flame py-4 font-display text-base font-black uppercase tracking-[0.16em] shadow-glow transition active:scale-[0.98] disabled:opacity-40"><Play size={20} fill="currentColor" />{t.canStart ? "Démarrer" : !t.storageReady ? "Vérification du stockage…" : "En attente du GPS…"}</button>
            {!t.canStart && !t.permissionError && t.storageReady && <button type="button" onClick={t.retryGps} className="mx-auto mt-3 flex items-center gap-1.5 text-xs text-white/60"><RefreshCw size={12} />Relancer la recherche GPS</button>}
            <p className="mt-3 text-center text-[10px] leading-relaxed text-white/45">Vous pouvez verrouiller l’écran pendant la sortie : le suivi GPS continue en arrière-plan.<br />Le GPS et la sauvegarde locale fonctionnent sans Internet.</p>
          </>}

          {(tracking || paused) && <>
            <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Distance</p><p data-testid="live-distance" className="tabular font-display text-[48px] font-black italic leading-tight">{fmtKm(t.stats.distanceM)}<span className="ml-1 text-sm not-italic text-white/40">km</span></p></div><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Durée active</p><p data-testid="live-time" className="tabular font-display text-[28px] font-extrabold italic">{fmtClock(t.stats.elapsedSec)}</p></div></div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/10 pt-3"><Stat label={ride ? "Vitesse act." : "Allure act."} value={ride ? fmtSpeed(t.stats.speed) : fmtPace(t.stats.speed)} unit={ride ? "km/h" : "/km"} /><Stat label={ride ? "Vitesse moy." : "Allure moy."} value={ride ? fmtSpeed(t.stats.avgSpeed) : fmtPace(t.stats.avgSpeed)} unit={ride ? "km/h" : "/km"} /><Stat label="Calories estimées" value={String(t.stats.calories)} unit="kcal" /></div>
            <div className="mt-5 flex gap-3">{tracking ? <button type="button" onClick={() => t.pause()} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-4 font-display text-sm font-black uppercase tracking-widest text-ink"><Pause size={18} fill="currentColor" />Pause</button> : <><button type="button" onClick={t.resume} disabled={saving || t.permissionError || t.busyElsewhere} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-flare to-flame py-4 font-display text-xs font-black uppercase tracking-widest disabled:opacity-40"><Play size={16} fill="currentColor" />Reprendre</button><button type="button" onClick={() => void finish()} disabled={saving || t.busyElsewhere} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 py-4 font-display text-xs font-black uppercase tracking-widest disabled:opacity-40"><Flag size={16} />{saving ? "Sauvegarde…" : "Terminer"}</button></>}</div>
            {paused && <button type="button" disabled={saving || t.busyElsewhere} onClick={() => setConfirmDelete(true)} className="mx-auto mt-3 block text-[11px] text-white/40">Abandonner la séance</button>}
            {tracking && <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-white/40"><ShieldCheck size={12} />Sauvegarde locale automatique · gardez l’application ouverte</p>}
          </>}

          {finished && saved && <>
            <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-flame/15"><Check size={20} className="text-flare" /></span><div><h1 className="font-display text-lg font-black italic">Activité enregistrée</h1><p className="text-[11px] text-white/50">{!sync.online ? "Sauvegardée sur cet appareil · synchronisation au retour du réseau" : sync.state === "synced" && sync.pending === 0 ? "Sauvegardée sur cet appareil et synchronisée" : sync.state === "error" ? "Sauvegardée sur cet appareil · synchronisation à réessayer" : "Sauvegardée sur cet appareil · synchronisation en attente"}</p></div></div>
            <input defaultValue={saved.name} onBlur={(e) => void rename(e.target.value)} maxLength={60} aria-label="Nom de l'activité" className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 font-display text-sm font-bold italic outline-none focus:border-flame" />
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 rounded-2xl border border-white/10 p-4"><Stat label="Distance" value={fmtKm(saved.distanceM)} unit="km" size="lg" accent /><Stat label="Durée active" value={fmtClock(saved.durationSec)} size="lg" /><Stat label={ride ? "Vitesse moy." : "Allure moy."} value={ride ? fmtSpeed(saved.avgSpeed) : fmtPace(saved.avgSpeed)} unit={ride ? "km/h" : "/km"} /><Stat label="Calories estimées" value={String(saved.calories)} unit="kcal" /><Stat label="Vitesse max" value={fmtSpeed(saved.maxSpeed)} unit="km/h" /><Stat label="Dénivelé + estimé" value={String(Math.round(saved.elevGain))} unit="m" /></div>
            {saved.distanceM < 100 && <p className="mt-2 text-[10px] text-amber-200/70">Sortie courte : les statistiques peuvent être peu significatives.</p>}
            <button type="button" onClick={() => void share()} disabled={sharing} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-flare to-flame py-4 font-display text-xs font-black uppercase tracking-widest disabled:opacity-50"><Share2 size={16} />{sharing ? "Génération…" : "Partager la performance"}</button>
            <div className="mt-2.5 flex gap-2.5"><Link href={`/activity?id=${saved.id}`} className="flex flex-1 items-center justify-center rounded-2xl border border-white/15 py-3.5 text-xs font-bold">Voir le détail</Link><button type="button" onClick={() => setConfirmDelete(true)} aria-label="Supprimer l'activité" className="rounded-2xl border border-red-400/25 px-5 text-red-300"><Trash2 size={16} /></button></div>
            <button type="button" onClick={async () => { try { await t.discard(); setSaved(null); setNotice(null); } catch { setNotice("Impossible de démarrer une nouvelle séance. Réessayez."); } }} className="mx-auto mt-4 block text-xs text-white/50">Nouvelle sortie</button>
          </>}
        </div>
      </section>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={saved ? "Supprimer cette activité ?" : "Abandonner cette séance ?"}><p className="text-sm text-white/55">Cette action est irréversible. {saved ? "La suppression sera synchronisée dès que le serveur sera accessible." : "La trace et le chrono de cette séance seront effacés."}</p><div className="mt-5 flex gap-3"><button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-white/15 py-3 text-sm">Annuler</button><button type="button" onClick={() => void discard()} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold">Confirmer la suppression</button></div></Sheet>
    </div>
  );
}
/* marqueur de build: version B definitive 1793630604 */
