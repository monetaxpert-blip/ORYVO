import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ActivityRecord, SportType, TrackPoint } from "./types";

export function ownerFromRequest(request: Request): string | null {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "");
  return match ? createHash("sha256").update(match[1]).digest("hex") : null;
}
export const jsonError = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
export const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{6,100}$/.test(id);
const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Validate every GPS point; reject (never silently truncate) oversized tracks. */
export function parseActivity(value: unknown): Omit<ActivityRecord, "createdAt"> | null {
  if (!object(value)) return null;
  const b = value;
  if (!validId(b.id) || typeof b.name !== "string" || !b.name.trim() || b.name.length > 120 || !["run", "walk", "ride", "hike"].includes(String(b.sport))) return null;
  if (!num(b.startedAt, 1, Date.now() + 86400000) || !num(b.durationSec, 0, 604800) || !num(b.distanceM, 0, 3000000) || !num(b.avgSpeed, 0, 200) || !num(b.maxSpeed, 0, 200) || !num(b.calories, 0, 1000000) || !num(b.elevGain, 0, 100000)) return null;
  if (!Array.isArray(b.points) || b.points.length > 100000 || !Array.isArray(b.splits) || b.splits.length > 3000) return null;
  const points: TrackPoint[] = [];
  let lastTime = -1;
  let lastSegment = -1;
  for (const p of b.points) {
    if (!object(p) || !num(p.lat, -90, 90) || !num(p.lng, -180, 180) || !num(p.t, 1, Date.now() + 86400000) || p.t <= lastTime || !num(p.seg, 0, 100000) || !Number.isInteger(p.seg) || p.seg < lastSegment) return null;
    if ((p.alt != null && !num(p.alt, -1500, 15000)) || (p.acc != null && !num(p.acc, 0, 100000)) || (p.spd != null && !num(p.spd, 0, 200))) return null;
    points.push({ lat: p.lat, lng: p.lng, t: p.t, seg: p.seg, alt: p.alt as number | null | undefined, acc: p.acc as number | null | undefined, spd: p.spd as number | null | undefined });
    lastTime = p.t;
    lastSegment = p.seg;
  }
  if (b.splits.some((s) => !object(s) || !num(s.km, 1, 3000) || !Number.isInteger(s.km) || !num(s.sec, 1, 604800))) return null;
  return {
    id: b.id, name: b.name.trim(), sport: b.sport as SportType, startedAt: Math.round(b.startedAt),
    durationSec: Math.round(b.durationSec), distanceM: b.distanceM, avgSpeed: b.avgSpeed,
    maxSpeed: b.maxSpeed, calories: Math.round(b.calories), elevGain: b.elevGain,
    points, splits: b.splits as ActivityRecord["splits"],
  };
}
