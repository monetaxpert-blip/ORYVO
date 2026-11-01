export type SportType = "run" | "walk" | "ride" | "hike";

export interface TrackPoint {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
  alt?: number | null;
  /** device-reported speed m/s (may be null) */
  spd?: number | null;
  /** reported accuracy in meters */
  acc?: number | null;
  /** segment index: breaks on pause / signal loss so the polyline never bridges gaps */
  seg: number;
}

export interface SplitKm {
  km: number;
  sec: number;
}

export interface ActivityRecord {
  id: string;
  name: string;
  sport: SportType;
  startedAt: number;
  durationSec: number;
  distanceM: number;
  avgSpeed: number;
  maxSpeed: number;
  calories: number;
  elevGain: number;
  points: TrackPoint[];
  splits: SplitKm[];
  createdAt: number;
  /** local-only sync bookkeeping */
  synced?: boolean;
  deleted?: boolean;
}

export interface ActivitySummary {
  id: string;
  name: string;
  sport: SportType;
  startedAt: number;
  durationSec: number;
  distanceM: number;
  avgSpeed: number;
  maxSpeed: number;
  calories: number;
  elevGain: number;
  splits: SplitKm[];
  createdAt: number;
}

export interface UserProfile {
  name: string;
  weightKg: number;
  weeklyGoalKm: number;
  autoPause: boolean;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: "",
  weightKg: 70,
  weeklyGoalKm: 20,
  autoPause: true,
};

export const SPORT_LABEL: Record<SportType, string> = {
  run: "Course",
  walk: "Marche",
  ride: "Vélo",
  hike: "Rando",
};
