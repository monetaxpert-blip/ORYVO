"use client";

import {
  CalendarDays,
  Check,
  Download,
  FileWarning,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "@/components/AppLink";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Sheet, SportChip, Stat } from "@/components/bits";
import type { StoredActivity } from "@/lib/idb";
import { idbMutateActivity } from "@/lib/idb";
import { fmtDay, fmtDuration, fmtKm, fmtPace, fmtSpeed, fmtTime } from "@/lib/format";
import { smoothedSpeeds } from "@/lib/geo";
import { downloadGpx } from "@/lib/gpx";
import { shareActivity } from "@/lib/share";
import { deleteActivitySmart, syncNow } from "@/lib/sync";
import { getActivityHydrated } from "@/lib/useActivities";

const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

/** Speed-over-time area chart (SVG, downsampled). */
function SpeedChart({ activity }: { activity: StoredActivity }) {
  const { path, area, minLab, maxLab } = useMemo(() => {
    const pts = activity.points ?? [];
    if (pts.length < 3) return { path: "", area: "", minLab: "", maxLab: "" };
    const speeds = smoothedSpeeds(pts);
    const t0 = pts[0].t;
    const tEnd = pts[pts.length - 1].t - t0 || 1;
    const N = 140;
    const buckets: { x: number; v: number }[] = [];
    const stride = Math.max(1, Math.floor(pts.length / N));
    for (let i = 0; i < pts.length; i += stride) {
      buckets.push({ x: (pts[i].t - t0) / tEnd, v: speeds[i] });
    }
    const vals = buckets.map((b) => b.v).filter((v) => v > 0.1);
    if (!vals.length) return { path: "", area: "", minLab: "", maxLab: "" };
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const W = 100;
    const H = 34;
    const norm = (v: number) => H - 3 - ((v - min) / Math.max(0.001, max - min)) * (H - 8);
    const dPath = buckets
      .map((b, i) => `${i === 0 ? "M" : "L"}${(b.x * W).toFixed(2)},${norm(b.v).toFixed(2)}`)
      .join(" ");
    const dArea = `${dPath} L100,${H} L0,${H} Z`;
    const ride = activity.sport === "ride";
    return {
      path: dPath,
      area: dArea,
      minLab: ride ? fmtSpeed(min) : fmtPace(Math.max(min, 0.4)),
      maxLab: ride ? fmtSpeed(max) : fmtPace(max),
    };
  }, [activity]);

  if (!path) return null;
  const ride = activity.sport === "ride";
  return (
    <div className="card mt-4 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xs font-extrabold uppercase italic tracking-[0.16em] text-white/70">
          {ride ? "Vitesse (km/h)" : "Allure (min/km)"}
        </h2>
        <div className="tabular flex items-center gap-3 text-[10px] font-bold text-white/40">
          <span>{ride ? "min" : "rapide"} {ride ? minLab : maxLab}</span>
          <span className="text-flare">{ride ? "max" : "lente"} {ride ? maxLab : minLab}</span>
        </div>
      </div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="mt-3 h-28 w-full">
        <defs>
          <linearGradient id="spdFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,90,0,0.45)" />
            <stop offset="100%" stopColor="rgba(255,90,0,0)" />
          </linearGradient>
          <linearGradient id="spdLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF8A00" />
            <stop offset="100%" stopColor="#FF5A00" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spdFill)" />
        <path d={path} fill="none" stroke="url(#spdLine)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">
        <span>Départ</span>
        <span>{fmtDuration(activity.durationSec)}</span>
      </div>
    </div>
  );
}

function SplitsTable({ activity }: { activity: StoredActivity }) {
  if (!activity.splits?.length) return null;
  const isRide = activity.sport === "ride";
  const times = activity.splits.map((s) => s.sec);
  const best = Math.min(...times);
  return (
    <div className="card mt-4 rounded-3xl p-5">
      <h2 className="font-display text-xs font-extrabold uppercase italic tracking-[0.16em] text-white/70">
        Fractions (par km)
      </h2>
      <div className="mt-3 space-y-1.5">
        {activity.splits.slice(0, 40).map((s) => {
          const ratio = best / s.sec;
          const isBest = s.sec === best;
          return (
            <div key={s.km} className="flex items-center gap-3">
              <span className="tabular w-8 text-xs font-bold text-white/40">{s.km}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className={`h-full rounded-full ${
                    isBest ? "bg-gradient-to-r from-flare to-flame shadow-[0_0_8px_rgba(255,90,0,0.6)]" : "bg-white/15"
                  }`}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <span className={`tabular w-16 text-right text-xs font-bold ${isBest ? "text-flare" : "text-white/75"}`}>
                {fmtDuration(s.sec)}
              </span>
            </div>
          );
        })}
      </div>
      {isRide && <p className="mt-3 text-[10px] text-white/35">Temps au kilomètre — plus court = plus rapide.</p>}
    </div>
  );
}

export default function ActivityDetail({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [activity, setActivity] = useState<StoredActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (!activityId) { setLoading(false); return; }
    void getActivityHydrated(activityId).then((a) => {
      if (!alive) return;
      setActivity(a && !a.deleted ? a : null);
      setName(a?.name ?? "");
      setLoading(false);
    }).catch(() => {
      if (alive) { setLoading(false); setError("Stockage local inaccessible. Réessayez après avoir autorisé les données de site."); }
    });
    return () => {
      alive = false;
    };
  }, [activityId]);

  const saveName = async () => {
    if (!activity) return;
    const n = name.trim();
    if (!n || n === activity.name) {
      setEditing(false);
      setName(activity.name);
      return;
    }
    try {
      await idbMutateActivity(activity.id, (current) => current && !current.deleted ? { ...current, name: n, synced: false, revision: (current.revision ?? 0) + 1 } : undefined);
      setActivity({ ...activity, name: n, synced: false });
      setEditing(false);
      setError(null);
      void syncNow();
    } catch { setError("Le nom n’a pas pu être sauvegardé. Réessayez."); }
  };

  if (loading) {
    return (
      <div className="space-y-4 px-4">
        <div className="shimmer h-10 w-48 rounded-xl" />
        <div className="shimmer h-72 rounded-3xl" />
        <div className="shimmer h-44 rounded-3xl" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="px-4">
        <div className="card flex flex-col items-center rounded-3xl px-6 py-12 text-center">
          <FileWarning className="mb-4 h-8 w-8 text-flare" />
          <h3 className="font-display text-lg font-extrabold italic">Activité introuvable</h3>
          <p className="mt-2 text-sm text-white/50">
            {error ?? "Cette activité a été supprimée ou n’est pas présente sur cet appareil."}
          </p>
          <Link
            href="/activities"
            className="mt-6 rounded-full bg-gradient-to-r from-flare to-flame px-6 py-3 font-display text-xs font-extrabold uppercase tracking-[0.16em] shadow-glow"
          >
            Mes activités
          </Link>
        </div>
      </div>
    );
  }

  const isRide = activity.sport === "ride";
  const hasRoute = (activity.points?.length ?? 0) > 1;

  return (
    <div className="animate-fade-up px-4">
      {error && <p role="alert" className="mb-4 rounded-xl border border-flame/30 bg-flame/10 p-3 text-xs text-orange-100">{error}</p>}
      <Link href="/activities" className="mb-4 inline-block text-xs text-white/50">← Mes activités</Link>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
            <CalendarDays className="h-3.5 w-3.5" />
            {fmtDay(activity.startedAt)} • {fmtTime(activity.startedAt)}
          </div>
          {editing ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                autoFocus
                aria-label="Nouveau nom de l'activité"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void saveName()}
                maxLength={60}
                className="w-full rounded-xl border border-flame/50 bg-white/[0.04] px-3 py-2 font-display text-lg font-black italic outline-none"
              />
              <button
                onClick={() => void saveName()}
                aria-label="Valider le nom"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-flame text-white active:scale-90"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="group mt-1 flex items-center gap-2 text-left"
            >
              <h1 className="truncate font-display text-2xl font-black italic leading-tight">
                {activity.name}
              </h1>
              <Pencil className="h-4 w-4 shrink-0 text-white/30 group-active:text-flare" />
            </button>
          )}
        </div>
        <SportChip sport={activity.sport} />
      </div>

      {/* Map */}
      <div className="mt-4 h-72 overflow-hidden rounded-3xl ring-1 ring-white/[0.08]">
        {hasRoute ? (
          <RouteMap points={activity.points} fitKey={activity.id} interactive />
        ) : (
          <div className="relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/hero-topo.png" alt="" className="h-full w-full object-cover opacity-60" />
            <p className="absolute inset-0 grid place-items-center px-8 text-center text-xs font-semibold text-white/50">
              Trace GPS indisponible pour cette activité
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="card mt-4 grid grid-cols-2 gap-x-4 gap-y-6 rounded-3xl p-5">
        <Stat label="Distance" value={fmtKm(activity.distanceM)} unit="km" size="lg" accent />
        <Stat label="Durée" value={fmtDuration(activity.durationSec)} size="lg" />
        <Stat
          label={isRide ? "Vitesse moyenne" : "Allure moyenne"}
          value={isRide ? fmtSpeed(activity.avgSpeed) : fmtPace(activity.avgSpeed)}
          unit={isRide ? "km/h" : "/km"}
        />
        <Stat label="Vitesse max" value={fmtSpeed(activity.maxSpeed)} unit="km/h" />
        <Stat label="Calories estimées" value={String(activity.calories)} unit="kcal" />
        <Stat label="Dénivelé + estimé" value={String(Math.round(activity.elevGain))} unit="m" />
      </div>

      <SpeedChart activity={activity} />
      <SplitsTable activity={activity} />

      {/* Actions */}
      <div className="mt-5 flex gap-2.5">
        <button
          onClick={async () => {
            setSharing(true);
            try {
              await shareActivity(activity);
            } catch {
              setError("Le partage n’a pas abouti. Vous pouvez réessayer ou exporter le GPX.");
            } finally {
              setSharing(false);
            }
          }}
          disabled={sharing}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-flare to-flame py-4 font-display text-xs font-black uppercase tracking-[0.14em] shadow-glow transition active:scale-[0.98] disabled:opacity-60"
        >
          <Share2 className="h-4 w-4" />
          {sharing ? "Génération…" : "Partager"}
        </button>
        <button
          onClick={() => downloadGpx(activity)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-4 text-xs font-extrabold uppercase tracking-[0.12em] text-white/80 transition active:scale-[0.97]"
        >
          <Download className="h-4 w-4" />
          GPX
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Supprimer l'activité"
          className="flex items-center justify-center rounded-2xl border border-red-400/25 bg-red-500/[0.07] px-4 py-4 text-red-300 transition active:scale-[0.97]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-4 pb-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25">
        ORYVO — Track • Run • Achieve
      </p>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer cette activité ?">
        <p className="text-sm text-white/55">
          « {activity.name} » sera définitivement supprimée de cet appareil et du cloud ORYVO.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => setConfirmDelete(false)}
            className="flex-1 rounded-2xl border border-white/15 bg-white/[0.04] py-3.5 text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Annuler
          </button>
          <button
            onClick={async () => {
              try {
                await deleteActivitySmart(activity.id);
                setConfirmDelete(false);
                if (navigator.onLine) router.replace("/activities");
                else window.location.assign("/activities");
              } catch { setError("Suppression impossible. Les données ont été conservées ; réessayez."); }
            }}
            className="flex-1 rounded-2xl bg-red-500 py-3.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white active:scale-[0.98]"
          >
            Supprimer
          </button>
        </div>
      </Sheet>
    </div>
  );
}
