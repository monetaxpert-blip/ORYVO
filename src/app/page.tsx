"use client";

import { ArrowRight, Flame, Timer, TrendingUp } from "lucide-react";
import Link from "@/components/AppLink";
import ActivityCard from "@/components/ActivityCard";
import { EmptyState, GoalRing, Stat, WeekBars } from "@/components/bits";
import { fmtDurationLong, fmtKm } from "@/lib/format";
import { weekStats } from "@/lib/insights";
import { useActivities } from "@/lib/useActivities";
import { useProfile } from "@/lib/profile";

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Nuit blanche";
  if (h < 12) return "Bonjour";
  if (h < 19) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomePage() {
  const { items, loading, error, reload } = useActivities();
  const [profile, , ready] = useProfile();

  const week = weekStats(items);
  const goal = Math.max(1, profile.weeklyGoalKm);
  const progress = week.distanceM / 1000 / goal;
  const recent = items.slice(0, 3);

  if (loading || !ready) {
    return (
      <div className="space-y-4 px-4">
        <div className="shimmer h-64 rounded-3xl" />
        <div className="shimmer h-40 rounded-3xl" />
        <div className="shimmer h-28 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5 px-4">
      {error && <div role="alert" className="rounded-xl border border-flame/30 bg-flame/10 p-3 text-xs text-orange-100">{error}<button type="button" onClick={() => void reload()} className="ml-2 font-bold underline">Réessayer</button></div>}
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero-topo.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/35 to-ink/92" />
        <div className="relative p-6 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-flare">
            {greeting()}
            {profile.name ? `, ${profile.name.split(" ")[0]}` : ""}
          </p>
          <h1 className="mt-1 font-display text-[26px] font-black italic leading-tight">
            Cette semaine
          </h1>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="tabular font-display text-[54px] font-black italic leading-none">
                {fmtKm(week.distanceM, 1)}
                <span className="ml-1 text-base font-bold not-italic text-white/45">km</span>
              </p>
              <p className="mt-2 text-xs font-semibold text-white/55">
                {week.count} activité{week.count > 1 ? "s" : ""} • {fmtDurationLong(week.durationSec)}
              </p>
            </div>
            <GoalRing progress={progress}>
              <div className="text-center">
                <p className="tabular font-display text-lg font-black italic leading-none">
                  {Math.round(progress * 100)}
                  <span className="text-[10px] not-italic text-white/50">%</span>
                </p>
                <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-white/40">
                  objectif
                </p>
              </div>
            </GoalRing>
          </div>

          <Link
            href="/record"
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-flare to-flame px-5 py-4 font-display text-sm font-extrabold uppercase tracking-[0.16em] text-white shadow-glow transition-transform duration-200 active:scale-[0.97]"
          >
            Lancer une sortie
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Week chart */}
      <section className="card rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-extrabold uppercase italic tracking-[0.14em] text-white/80">
            Rythme sur 7 jours
          </h2>
          <TrendingUp className="h-4 w-4 text-flare" />
        </div>
        <div className="mt-4">
          <WeekBars data={week.daysKm} labels={DAY_LABELS} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4">
          <Stat label="Temps actif" value={fmtDurationLong(week.durationSec)} />
          <Stat label="Calories" value={String(week.calories)} unit="kcal" />
        </div>
      </section>

      {/* Recent */}
      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="font-display text-sm font-extrabold uppercase italic tracking-[0.14em] text-white/80">
            Dernières activités
          </h2>
          {items.length > 0 && (
            <Link
              href="/activities"
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-flare"
            >
              Tout voir
            </Link>
          )}
        </div>
        {recent.length > 0 ? (
          <div className="space-y-3">
            {recent.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Flame}
            title="Aucune activité"
            body="Votre historique est prêt. Enfilez vos chaussures, le GPS s'occupe du reste."
          >
            <Link
              href="/record"
              className="mt-6 flex items-center gap-2 rounded-full bg-gradient-to-r from-flare to-flame px-6 py-3 font-display text-xs font-extrabold uppercase tracking-[0.16em] shadow-glow transition-transform active:scale-95"
            >
              Première sortie
              <Timer className="h-4 w-4" />
            </Link>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
