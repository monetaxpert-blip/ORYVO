import type { ActivityRecord, SportType } from "./types";

export function startOfWeekMonday(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dow);
  return date.getTime();
}

export interface WeekStats {
  daysKm: number[]; // Monday..Sunday
  distanceM: number;
  durationSec: number;
  calories: number;
  count: number;
}

export function weekStats(items: ActivityRecord[], ref = new Date()): WeekStats {
  const start = startOfWeekMonday(ref);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + 7);
  const end = endDate.getTime();
  const daysKm = new Array<number>(7).fill(0);
  let distanceM = 0;
  let durationSec = 0;
  let calories = 0;
  let count = 0;
  for (const a of items) {
    if (a.startedAt >= start && a.startedAt < end) {
      const idx = (new Date(a.startedAt).getDay() + 6) % 7;
      daysKm[idx] += a.distanceM / 1000;
      distanceM += a.distanceM;
      durationSec += a.durationSec;
      calories += a.calories;
      count++;
    }
  }
  return { daysKm, distanceM, durationSec, calories, count };
}

export interface Totals {
  distanceM: number;
  durationSec: number;
  calories: number;
  elevGain: number;
  count: number;
}

export function totals(items: ActivityRecord[]): Totals {
  return items.reduce(
    (acc, a) => ({
      distanceM: acc.distanceM + a.distanceM,
      durationSec: acc.durationSec + a.durationSec,
      calories: acc.calories + a.calories,
      elevGain: acc.elevGain + a.elevGain,
      count: acc.count + 1,
    }),
    { distanceM: 0, durationSec: 0, calories: 0, elevGain: 0, count: 0 }
  );
}

export interface Records {
  longestM: ActivityRecord | null;
  fastestPace: ActivityRecord | null;
  longestTime: ActivityRecord | null;
  topSpeed: ActivityRecord | null;
}

export function records(items: ActivityRecord[]): Records {
  let longestM: ActivityRecord | null = null;
  let fastestPace: ActivityRecord | null = null;
  let longestTime: ActivityRecord | null = null;
  let topSpeed: ActivityRecord | null = null;
  for (const a of items) {
    if (!longestM || a.distanceM > longestM.distanceM) longestM = a;
    if (!longestTime || a.durationSec > longestTime.durationSec) longestTime = a;
    if (
      (a.sport === "run" || a.sport === "hike" || a.sport === "walk") &&
      a.distanceM >= 2000 &&
      a.avgSpeed > 1 &&
      (!fastestPace || a.avgSpeed > fastestPace.avgSpeed)
    ) {
      fastestPace = a;
    }
    if (a.sport === "ride" && (!topSpeed || a.maxSpeed > topSpeed.maxSpeed)) topSpeed = a;
  }
  return { longestM, fastestPace, longestTime, topSpeed };
}

export interface Badge {
  id: string;
  label: string;
  hint: string;
  unlocked: boolean;
}

export function badges(items: ActivityRecord[]): Badge[] {
  const t = totals(items);
  const maxSingle = Math.max(0, ...items.map((a) => a.distanceM));
  const maxElev = Math.max(0, ...items.map((a) => a.elevGain));
  const early = items.some((a) => new Date(a.startedAt).getHours() < 7);
  const night = items.some((a) => new Date(a.startedAt).getHours() >= 21);
  const sports = new Set<SportType>(items.map((a) => a.sport));
  return [
    { id: "first", label: "Premier pas", hint: "1re activité enregistrée", unlocked: t.count >= 1 },
    { id: "ten", label: "Régulier", hint: "10 activités", unlocked: t.count >= 10 },
    { id: "hundred", label: "Centurion", hint: "100 km cumulés", unlocked: t.distanceM >= 100000 },
    { id: "fivehundred", label: "Ultra", hint: "500 km cumulés", unlocked: t.distanceM >= 500000 },
    { id: "marathon", label: "Marathonien", hint: "42,2 km en une sortie", unlocked: maxSingle >= 42195 },
    { id: "climber", label: "Grimpeur", hint: "300 m de dénivelé en une sortie", unlocked: maxElev >= 300 },
    { id: "early", label: "Lève-tôt", hint: "Sortie avant 7 h", unlocked: early },
    { id: "night", label: "Noctambule", hint: "Sortie après 21 h", unlocked: night },
    { id: "multi", label: "Polyvalent", hint: "3 sports différents", unlocked: sports.size >= 3 },
  ];
}
