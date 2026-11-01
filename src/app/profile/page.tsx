"use client";

import {
  Award,
  CloudUpload,
  Flame,
  Gauge,
  Lock,
  Mountain,
  Route,
  Timer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { GoalRing, Sheet, Stat, Toggle } from "@/components/bits";
import { fmtDurationLong, fmtKm, fmtPace, fmtSpeed, fmtShortDate } from "@/lib/format";
import { badges, records, totals, weekStats } from "@/lib/insights";
import { deleteActivitySmart, syncNow } from "@/lib/sync";
import { useActivities } from "@/lib/useActivities";
import { useProfile } from "@/lib/profile";
import type { ActivityRecord } from "@/lib/types";

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const txt = parts.length ? parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase() : "OR";
  return (
    <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-flare to-flame font-display text-xl font-black italic text-white shadow-glow">
      {txt}
    </div>
  );
}

function RecordRow({
  icon: Icon,
  label,
  act,
  value,
}: {
  icon: typeof Route;
  label: string;
  act: ActivityRecord | null;
  value: (a: ActivityRecord) => string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-flame/10">
        <Icon className="h-4 w-4 text-flare" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{label}</p>
        {act ? (
          <>
            <p className="tabular truncate font-display text-base font-extrabold italic">{value(act)}</p>
            <p className="truncate text-[11px] text-white/40">{fmtShortDate(act.startedAt)} — {act.name}</p>
          </>
        ) : (
          <p className="text-sm font-semibold text-white/30">—</p>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, update, ready, profileError] = useProfile();
  const { items, reload, error: storageError } = useActivities();
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const t = totals(items);
  const rec = records(items);
  const badgeList = badges(items);
  const week = weekStats(items);
  const progress = week.distanceM / 1000 / Math.max(1, profile.weeklyGoalKm);
  const unlocked = badgeList.filter((b) => b.unlocked).length;

  if (!ready) {
    return (
      <div className="space-y-4 px-4">
        <div className="shimmer h-32 rounded-3xl" />
        <div className="shimmer h-48 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5 px-4">
      {(profileError || storageError) && <p role="alert" className="rounded-xl bg-flame/10 p-3 text-xs text-orange-100">{profileError || storageError}</p>}
      {/* Identity */}
      <section className="card flex items-center gap-4 rounded-3xl p-5">
        <Initials name={profile.name} />
        <div className="min-w-0 flex-1">
          <input
            defaultValue={profile.name}
            placeholder="Votre nom"
            maxLength={40}
            onBlur={(e) => update({ name: e.target.value.trim() })}
            className="w-full bg-transparent font-display text-xl font-black italic outline-none placeholder:text-white/25 focus:text-white"
            aria-label="Nom de l'athlète"
          />
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Athlète ORYVO
          </p>
        </div>
        <GoalRing progress={progress} size={64} stroke={7}>
          <p className="tabular font-display text-xs font-black italic">{Math.round(progress * 100)}%</p>
        </GoalRing>
      </section>

      {/* Totals */}
      <section className="card rounded-3xl p-5">
        <h2 className="font-display text-xs font-extrabold uppercase italic tracking-[0.16em] text-white/70">
          Statistiques cumulées
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat label="Distance totale" value={fmtKm(t.distanceM, 0)} unit="km" size="lg" accent />
          <Stat label="Temps d'activité" value={fmtDurationLong(t.durationSec)} size="lg" />
          <Stat label="Sorties" value={String(t.count)} />
          <Stat label="Calories" value={t.calories.toLocaleString("fr-FR")} unit="kcal" />
          <Stat label="Dénivelé cumulé" value={Math.round(t.elevGain).toLocaleString("fr-FR")} unit="m" />
          <Stat label="Semaine en cours" value={fmtKm(week.distanceM, 1)} unit="km" />
        </div>
      </section>

      {/* Records */}
      <section className="card rounded-3xl p-5">
        <h2 className="font-display text-xs font-extrabold uppercase italic tracking-[0.16em] text-white/70">
          Records personnels
        </h2>
        <div className="mt-2 divide-y divide-white/[0.05]">
          <RecordRow icon={Route} label="Plus longue sortie" act={rec.longestM} value={(a) => `${fmtKm(a.distanceM)} km`} />
          <RecordRow icon={Timer} label="Meilleure allure" act={rec.fastestPace} value={(a) => `${fmtPace(a.avgSpeed)} /km`} />
          <RecordRow icon={Flame} label="Plus longue durée" act={rec.longestTime} value={(a) => fmtDurationLong(a.durationSec)} />
          <RecordRow icon={Gauge} label="Vitesse max (vélo)" act={rec.topSpeed} value={(a) => `${fmtSpeed(a.maxSpeed)} km/h`} />
        </div>
      </section>

      {/* Badges */}
      <section className="card rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-extrabold uppercase italic tracking-[0.16em] text-white/70">
            Badges
          </h2>
          <span className="tabular text-[11px] font-bold text-white/40">
            {unlocked}/{badgeList.length}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {badgeList.map((b) => (
            <div
              key={b.id}
              className={`flex flex-col items-center rounded-2xl border px-2 py-3.5 text-center transition ${
                b.unlocked
                  ? "border-flame/30 bg-flame/[0.08]"
                  : "border-white/[0.06] bg-white/[0.02] opacity-45"
              }`}
              title={b.hint}
            >
              {b.unlocked ? (
                <Award className="h-5 w-5 text-flare" />
              ) : (
                <Lock className="h-5 w-5 text-white/30" />
              )}
              <p className="mt-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em]">{b.label}</p>
              <p className="mt-0.5 text-[9px] leading-tight text-white/40">{b.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Settings */}
      <section className="card rounded-3xl p-5">
        <h2 className="font-display text-xs font-extrabold uppercase italic tracking-[0.16em] text-white/70">
          Réglages
        </h2>
        <div className="mt-4 space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold" htmlFor="weight">
                Poids
              </label>
              <span className="tabular font-display text-lg font-extrabold italic text-flare">
                {profile.weightKg} kg
              </span>
            </div>
            <input
              id="weight"
              type="range"
              min={40}
              max={140}
              step={1}
              value={profile.weightKg}
              onChange={(e) => update({ weightKg: Number(e.target.value) })}
              className="mt-2 w-full accent-flame"
            />
            <p className="text-[11px] text-white/40">Utilisé pour l'estimation des calories (modèle MET).</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold" htmlFor="goal">
                Objectif hebdomadaire
              </label>
              <span className="tabular font-display text-lg font-extrabold italic text-flare">
                {profile.weeklyGoalKm} km
              </span>
            </div>
            <input
              id="goal"
              type="range"
              min={5}
              max={120}
              step={5}
              value={profile.weeklyGoalKm}
              onChange={(e) => update({ weeklyGoalKm: Number(e.target.value) })}
              className="mt-2 w-full accent-flame"
            />
          </div>
          <Toggle
            checked={profile.autoPause}
            onChange={(v) => update({ autoPause: v })}
            label="Pause automatique"
            hint="Suspend le chrono quand vous êtes à l'arrêt, reprend au premier pas."
          />
          <button
            onClick={async () => {
              const result = await syncNow();
              await reload();
              setSyncMsg(result.state === "synced" ? "Synchronisation terminée" : result.state === "offline" ? "Hors ligne — les données restent sur cet appareil" : result.error ?? "Synchronisation en attente");
              setTimeout(() => setSyncMsg(null), 2500);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] py-3.5 text-xs font-extrabold uppercase tracking-[0.14em] transition active:scale-[0.98]"
          >
            <CloudUpload className="h-4 w-4 text-flare" />
            Synchroniser maintenant
          </button>
          {syncMsg && <p className="text-center text-xs font-semibold text-flare">{syncMsg}</p>}
          <button
            onClick={() => setConfirmReset(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/[0.05] py-3 text-xs font-bold uppercase tracking-[0.12em] text-red-300/90 transition active:scale-[0.98]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Tout effacer
          </button>
        </div>
      </section>

      <p className="px-2 text-[11px] leading-relaxed text-white/45">Vos activités sont privées et liées à cet appareil. Effacer les données du navigateur supprime cet accès. Exportez vos sorties en GPX pour conserver une copie. Le suivi GPS nécessite de garder ORYVO ouverte ; le navigateur peut le suspendre en arrière-plan.</p>

      <footer className="flex flex-col items-center gap-1 pb-2 pt-2 text-center">
        <Mountain className="h-4 w-4 text-flame/60" />
        <p className="font-display text-[11px] font-black italic tracking-[0.3em] text-white/35">
          ORYVO B · 1.1
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/20">
          Track • Run • Achieve
        </p>
      </footer>

      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Effacer toutes les activités ?">
        <p className="text-sm leading-relaxed text-white/55">
          L'historique sera supprimé de cet appareil <em>et</em> du cloud ORYVO au prochain accès
          réseau. Cette action est irréversible.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => setConfirmReset(false)}
            className="flex-1 rounded-2xl border border-white/15 bg-white/[0.04] py-3.5 text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Annuler
          </button>
          <button
            onClick={async () => {
              try {
                for (const a of items) await deleteActivitySmart(a.id);
                setConfirmReset(false);
                await reload();
              } catch { setSyncMsg("Suppression incomplète. Les données restantes ont été conservées ; réessayez."); }
            }}
            className="flex-1 rounded-2xl bg-red-500 py-3.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white active:scale-[0.98]"
          >
            Effacer
          </button>
        </div>
      </Sheet>
    </div>
  );
}
