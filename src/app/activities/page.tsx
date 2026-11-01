"use client";

import { History, Layers } from "lucide-react";
import Link from "@/components/AppLink";
import { useMemo, useState } from "react";
import ActivityCard from "@/components/ActivityCard";
import { EmptyState, SPORT_ICON } from "@/components/bits";
import { fmtDurationLong, fmtKm } from "@/lib/format";
import { useActivities } from "@/lib/useActivities";
import { SPORT_LABEL, type SportType } from "@/lib/types";

const FILTERS: (SportType | "all")[] = ["all", "run", "walk", "ride", "hike"];

export default function ActivitiesPage() {
  const { items, loading, error, reload } = useActivities();
  const [filter, setFilter] = useState<SportType | "all">("all");

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((a) => a.sport === filter)),
    [items, filter]
  );

  const month = useMemo(() => {
    const now = new Date();
    const m = filtered.filter((a) => {
      const d = new Date(a.startedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return {
      km: m.reduce((s, a) => s + a.distanceM, 0),
      time: m.reduce((s, a) => s + a.durationSec, 0),
    };
  }, [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const a of filtered) {
      const key = new Date(a.startedAt).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="animate-fade-up space-y-5 px-4">
      {error && <div role="alert" className="rounded-xl border border-flame/30 bg-flame/10 p-3 text-xs text-orange-100">{error}<button type="button" onClick={() => void reload()} className="ml-2 font-bold underline">Réessayer</button></div>}
      <header className="flex items-end justify-between px-1">
        <div>
          <h1 className="font-display text-3xl font-black italic">Activités</h1>
          <p className="mt-1 text-xs font-semibold text-white/45">
            {filtered.length} sortie{filtered.length > 1 ? "s" : ""}
            {filtered.length > 0 && (
              <>
                {" "}
                • ce mois-ci : {fmtKm(month.km, 1)} km, {fmtDurationLong(month.time)}
              </>
            )}
          </p>
        </div>
        <Layers className="mb-1 h-5 w-5 text-flare/70" />
      </header>

      {/* Sport filter */}
      <div className="flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = filter === f;
          const Icon = f === "all" ? History : SPORT_ICON[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition-all active:scale-95 ${
                active
                  ? "border-flame/60 bg-flame/15 text-flare"
                  : "border-white/10 bg-white/[0.03] text-white/45"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {f === "all" ? "Tous" : SPORT_LABEL[f]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="shimmer h-28 rounded-3xl" />
          <div className="shimmer h-28 rounded-3xl" />
          <div className="shimmer h-28 rounded-3xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title={filter === "all" ? "Aucune activité" : `Aucune ${SPORT_LABEL[filter].toLowerCase()}`}
          body="Enregistrez votre première sortie : le traceur GPS fonctionne même sans réseau."
        >
          <Link
            href="/record"
            className="mt-6 rounded-full bg-gradient-to-r from-flare to-flame px-6 py-3 font-display text-xs font-extrabold uppercase tracking-[0.16em] shadow-glow transition active:scale-95"
          >
            Enregistrer
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, acts]) => (
            <section key={day}>
              <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
                {new Intl.DateTimeFormat("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date(day))}
              </p>
              <div className="space-y-3">
                {acts.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
