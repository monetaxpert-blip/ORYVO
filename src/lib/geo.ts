import type { SportType, SplitKm, TrackPoint } from "./types";

const EARTH_R = 6371000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/** Max plausible speed per sport (m/s) used to reject GPS glitches. */
export const SPORT_MAX_SPEED: Record<SportType, number> = {
  run: 9.5,
  walk: 3.4,
  ride: 27,
  hike: 7,
};

export const SPORT_LABEL_KMH: Record<SportType, string> = {
  run: "/km",
  walk: "/km",
  ride: "km/h",
  hike: "/km",
};

/** Total distance, never bridging segment gaps (pause / signal loss). */
export function trackDistance(points: TrackPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.seg !== b.seg) continue;
    d += haversineM(a.lat, a.lng, b.lat, b.lng);
  }
  return d;
}

/**
 * Remove aberrant coordinates: a point implying an impossible speed between
 * accepted neighbors is dropped. Runs per segment.
 */
export function sanitizeTrack(points: TrackPoint[], sport: SportType): TrackPoint[] {
  if (points.length < 2) return points.slice();
  const maxV = SPORT_MAX_SPEED[sport];
  const out: TrackPoint[] = [];
  let last: TrackPoint | null = null;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (!last || p.seg !== last.seg) {
      out.push(p);
      last = p;
      continue;
    }
    const dt = (p.t - last.t) / 1000;
    if (dt <= 0) continue;
    const d = haversineM(last.lat, last.lng, p.lat, p.lng);
    const v = d / dt;
    // teleport glitch: absurd speed over a short timespan
    if (v > maxV * 1.9 && dt < 30) continue;
    out.push(p);
    last = p;
  }
  return out;
}

/** Smoothed inst speeds (m/s), centered moving average, never bridging gaps. */
export function smoothedSpeeds(points: TrackPoint[]): number[] {
  const n = points.length;
  const raw = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.seg !== b.seg) continue;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) continue;
    raw[i] = haversineM(a.lat, a.lng, b.lat, b.lng) / dt;
  }
  const smooth = new Array<number>(n).fill(0);
  const W = 2;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let c = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) {
      if (points[j].seg !== points[i].seg || (j > 0 && points[j].seg !== points[j - 1].seg)) continue;
      sum += raw[j];
      c++;
    }
    smooth[i] = c ? sum / c : 0;
  }
  return smooth;
}

/** Elevation gain with 2.5m hysteresis to kill baro/GPS noise. */
export function elevationGain(points: TrackPoint[]): number {
  let gain = 0;
  let base: number | null = null;
  let segment = -1;
  for (const p of points) {
    if (p.seg !== segment) { base = null; segment = p.seg; }
    if (p.alt == null || !Number.isFinite(p.alt)) continue;
    if (base == null) {
      base = p.alt;
      continue;
    }
    const delta = p.alt - base;
    if (delta >= 2.5) {
      gain += delta;
      base = p.alt;
    } else if (delta <= -2.5) {
      base = p.alt;
    }
  }
  return Math.round(gain);
}

/** Interpolate kilometer crossings; preserve partial splits across pauses. */
export function computeSplits(points: TrackPoint[]): SplitKm[] {
  const splits: SplitKm[] = [];
  let distance = 0, activeSeconds = 0, lastCrossing = 0, target = 1000;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.seg !== b.seg || b.t <= a.t) continue;
    const d = haversineM(a.lat, a.lng, b.lat, b.lng);
    const dt = (b.t - a.t) / 1000;
    while (d > 0 && distance + d >= target) {
      const crossing = activeSeconds + dt * (target - distance) / d;
      splits.push({ km: target / 1000, sec: Math.max(1, Math.round(crossing - lastCrossing)) });
      lastCrossing = crossing;
      target += 1000;
    }
    distance += d;
    activeSeconds += dt;
  }
  return splits;
}

/** Cumulative distance at each point (meters). */
export function cumulativeDistances(points: TrackPoint[]): number[] {
  const cum = new Array<number>(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    cum[i] = a.seg === b.seg ? cum[i - 1] + haversineM(a.lat, a.lng, b.lat, b.lng) : cum[i - 1];
  }
  return cum;
}

/**
 * Energy estimate using compendium MET formulas.
 * Running/Walking: Pandolf oxygen-consumption model. Ride: speed-tiered METs.
 */
export function caloriesFor(
  sport: SportType,
  weightKg: number,
  distanceM: number,
  durationSec: number,
  avgSpeed: number
): number {
  const hours = durationSec / 3600;
  if (hours <= 0 || weightKg <= 0) return 0;
  const kmh = avgSpeed * 3.6;
  let met: number;
  switch (sport) {
    case "run": {
      const mPerMin = (kmh * 1000) / 60;
      met = Math.min(20, Math.max(5, (mPerMin * 0.2 + 3.5) / 3.5));
      break;
    }
    case "walk":
      met = kmh < 4 ? 2.8 : kmh < 5.5 ? 3.5 : 5;
      break;
    case "ride":
      met = kmh < 16 ? 4 : kmh < 19 ? 6 : kmh < 22.5 ? 8 : kmh < 25.5 ? 10 : 12;
      break;
    case "hike":
      met = 6;
      break;
  }
  // Fallback sanity: never under the flat-run rule of thumb (~1 kcal/kg/km)
  const byMet = met * weightKg * hours;
  const byRule = weightKg * (distanceM / 1000) * (sport === "ride" ? 0.35 : 1.0);
  return Math.round(Math.max(byMet, isFinite(byRule) ? Math.min(byRule, byMet * 1.6) : 0));
}

export function maxSmoothedSpeed(points: TrackPoint[]): number {
  const s = smoothedSpeeds(points);
  let m = 0;
  for (const v of s) if (v > m) m = v;
  return m;
}

/** auto-pause trigger speed per sport */
export function autoPauseFloor(sport: SportType): number {
  return sport === "ride" ? 0.8 : 0.35;
}
