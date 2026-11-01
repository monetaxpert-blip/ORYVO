"use client";

import { CloudUpload } from "lucide-react";
import Link from "@/components/AppLink";
import type { StoredActivity } from "@/lib/idb";
import { fmtDuration, fmtKm, fmtPace, fmtSpeed, fmtTime, relDay } from "@/lib/format";
import { SPORT_LABEL } from "@/lib/types";
import { MiniRoute, SPORT_ICON } from "./bits";

export default function ActivityCard({ activity }: { activity: StoredActivity }) {
  const Icon = SPORT_ICON[activity.sport];
  const isRide = activity.sport === "ride";
  return (
    <Link
      href={`/activity?id=${encodeURIComponent(activity.id)}`}
      className="card group block rounded-3xl p-4 transition-transform duration-200 active:scale-[0.98]"
    >
      <div className="flex items-center gap-4">
        <div className="grid h-[92px] w-[92px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-black/60 ring-1 ring-white/[0.06]">
          {activity.points && activity.points.length > 1 ? (
            <MiniRoute points={activity.points} size={92} />
          ) : (
            <Icon className="h-7 w-7 text-flare/70" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
              {relDay(activity.startedAt)} • {fmtTime(activity.startedAt)}
            </p>
            {!activity.synced && (
              <span title="En attente de synchronisation">
                <CloudUpload className="h-3.5 w-3.5 animate-breathe text-flame" />
              </span>
            )}
          </div>
          <h3 className="mt-0.5 truncate font-display text-[15px] font-extrabold italic leading-tight">
            {activity.name}
          </h3>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className="tabular font-display text-xl font-black italic text-white">
              {fmtKm(activity.distanceM)}
              <span className="ml-0.5 text-[11px] font-bold not-italic text-white/40">km</span>
            </span>
            <span className="tabular text-xs font-semibold text-white/55">
              {fmtDuration(activity.durationSec)}
            </span>
            <span className="tabular text-xs font-semibold text-white/55">
              {isRide ? `${fmtSpeed(activity.avgSpeed)} km/h` : `${fmtPace(activity.avgSpeed)} /km`}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-white/35">
            {SPORT_LABEL[activity.sport]}
          </p>
        </div>
      </div>
    </Link>
  );
}
