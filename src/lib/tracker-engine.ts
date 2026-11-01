import type { ActivityRecord, SportType, TrackPoint } from "./types";
import type { SessionSnapshot } from "./idb";
import { caloriesFor, computeSplits, elevationGain, haversineM, maxSmoothedSpeed, SPORT_MAX_SPEED, trackDistance } from "./geo";

export type TrackerStatus = "idle" | "ready" | "tracking" | "paused" | "autopaused" | "finished";
export const SIGNAL_TIMEOUT_MS = 15000;

/** Deterministic GPS/clock state machine, independent of React and network. */
export class TrackerEngine {
  id = "";
  status: TrackerStatus = "idle";
  sport: SportType = "run";
  points: TrackPoint[] = [];
  startTs = 0;
  elapsedMs = 0;
  activeSince = 0;
  segment = 0;
  distanceM = 0;
  speed = 0;
  lastFix: TrackPoint | null = null;
  lastMovingAt = 0;
  private lastAccepted: TrackPoint | null = null;

  elapsed(now: number) {
    return Math.max(0, this.elapsedMs + (this.status === "tracking" ? Math.max(0, now - this.activeSince) : 0));
  }
  start(id: string, now: number) {
    this.id = id;
    this.points = [];
    this.distanceM = 0;
    this.speed = 0;
    this.startTs = now;
    this.elapsedMs = 0;
    this.activeSince = now;
    this.segment = 0;
    this.lastMovingAt = now;
    this.lastAccepted = null;
    this.status = "tracking";
    if (this.lastFix && now - this.lastFix.t <= 5000 && (this.lastFix.acc ?? Infinity) <= 40) {
      this.append({ ...this.lastFix, t: now, seg: 0 });
    }
  }
  pause(now: number, auto = false) {
    if (this.status !== "tracking") return;
    this.elapsedMs = this.elapsed(now);
    this.activeSince = 0;
    this.speed = 0;
    this.status = auto ? "autopaused" : "paused";
  }
  resume(now: number) {
    if (this.status !== "paused" && this.status !== "autopaused") return;
    this.status = "tracking";
    this.activeSince = now;
    this.segment++;
    this.lastAccepted = null;
    this.lastMovingAt = now;
    this.speed = 0;
  }
  finish(now: number) {
    if (this.status === "tracking") this.pause(now);
    this.status = "finished";
    this.speed = 0;
  }
  private append(point: TrackPoint) {
    const previous = this.lastAccepted;
    if (previous && previous.seg === point.seg) this.distanceM += haversineM(previous.lat, previous.lng, point.lat, point.lng);
    this.points.push(point);
    this.lastAccepted = point;
  }

  /** Returns false for stale/inaccurate/impossible fixes. Rejected fixes never move the camera. */
  ingest(point: TrackPoint, now: number, autoPause: boolean): boolean {
    if (!Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || !Number.isFinite(point.lng) || Math.abs(point.lng) > 180 || !Number.isFinite(point.t) || Math.abs(now - point.t) > 10000 || (point.acc ?? Infinity) > 40) return false;
    const prevFix = this.lastFix;
    if (prevFix && point.t <= prevFix.t) return false;
    const gap = prevFix ? point.t - prevFix.t : 0;
    const fixDistance = prevFix ? haversineM(prevFix.lat, prevFix.lng, point.lat, point.lng) : 0;
    if (prevFix && gap < SIGNAL_TIMEOUT_MS && fixDistance / Math.max(0.001, gap / 1000) > SPORT_MAX_SPEED[this.sport] * 1.9) return false;
    this.lastFix = point;
    if (this.status === "idle") this.status = "ready";
    if (this.status !== "tracking" && this.status !== "autopaused") return true;
    if (point.t < this.startTs) return true;
    const anchor = this.lastAccepted;
    const distance = anchor ? haversineM(anchor.lat, anchor.lng, point.lat, point.lng) : 0;
    const threshold = Math.max(2.5, Math.min(6, (point.acc ?? 10) * 0.3));
    if (this.status === "autopaused") {
      if (anchor && distance >= Math.max(6, threshold * 2)) {
        this.resume(now);
        this.append({ ...point, seg: this.segment });
      }
      return true;
    }
    if (gap > SIGNAL_TIMEOUT_MS) {
      this.segment++;
      this.lastAccepted = null;
      this.speed = 0;
      this.lastMovingAt = now;
    }
    if (!this.lastAccepted) {
      this.append({ ...point, seg: this.segment });
      return true;
    }
    if (point.t <= this.lastAccepted.t) return true;
    if (distance >= threshold) {
      const dt = (point.t - this.lastAccepted.t) / 1000;
      const measured = distance / dt;
      if (measured > SPORT_MAX_SPEED[this.sport] * 1.9) return false;
      this.speed = this.speed ? this.speed * 0.4 + measured * 0.6 : measured;
      this.append({ ...point, seg: this.segment });
      this.lastMovingAt = now;
    } else if (now - this.lastMovingAt > 3000) {
      this.speed = 0;
    }
    this.tick(now, autoPause);
    return true;
  }
  tick(now: number, autoPause: boolean) {
    if (this.status !== "tracking") return;
    if (now - (this.lastFix?.t ?? 0) > 5000 || now - this.lastMovingAt > 3000) this.speed = 0;
    // Never auto-pause because of lost signal: only fresh stationary fixes count.
    if (autoPause && this.lastFix && now - this.lastFix.t <= 5000 && now - this.lastMovingAt >= 8000) this.pause(now, true);
  }
  snapshot(now: number): SessionSnapshot {
    const elapsedMs = this.elapsed(now);
    return { id: this.id, points: this.points.slice(), startTs: this.startTs, sport: this.sport,
      status: this.status, seg: this.segment, savedAt: now, elapsedMs,
      pausedTotal: Math.max(0, now - this.startTs - elapsedMs),
      pauseStart: this.status === "tracking" ? null : now };
  }
  restore(snapshot: SessionSnapshot, id: string) {
    this.id = snapshot.id ?? id;
    this.sport = snapshot.sport;
    this.points = snapshot.points ?? [];
    this.startTs = snapshot.startTs;
    this.elapsedMs = snapshot.elapsedMs ?? Math.max(0, snapshot.savedAt - snapshot.startTs - snapshot.pausedTotal - (snapshot.pauseStart == null ? 0 : snapshot.savedAt - snapshot.pauseStart));
    this.activeSince = 0;
    this.segment = snapshot.seg;
    this.lastAccepted = this.points.at(-1) ?? null;
    this.lastFix = null;
    this.distanceM = trackDistance(this.points);
    this.speed = 0;
    this.status = "paused";
  }
  record(name: string, now: number, weight: number): ActivityRecord {
    const durationSec = Math.round(this.elapsed(now) / 1000);
    const avgSpeed = durationSec > 0 ? this.distanceM / durationSec : 0;
    return { id: this.id, name, sport: this.sport, startedAt: this.startTs,
      durationSec, distanceM: this.distanceM, avgSpeed,
      maxSpeed: Math.max(avgSpeed, Math.min(SPORT_MAX_SPEED[this.sport] * 1.9, maxSmoothedSpeed(this.points))),
      calories: caloriesFor(this.sport, weight, this.distanceM, durationSec, avgSpeed),
      elevGain: elevationGain(this.points), splits: computeSplits(this.points),
      points: this.points.slice(), createdAt: now };
  }
}
