"use client";

import { idbGetAllActivities, idbGetActivity, idbMutateActivity, type StoredActivity } from "./idb";
import { apiFetch, deviceToken } from "./client-api";
import type { ActivityRecord } from "./types";

export type SyncReport = { state: "idle" | "syncing" | "offline" | "error" | "synced"; error?: string; lastSuccess?: number };
let report: SyncReport = { state: "idle" };
let inFlight: Promise<SyncReport> | null = null;
let again = false;
let started = false;
export function getSyncReport() { return report; }
function update(next: SyncReport) {
  report = next;
  window.dispatchEvent(new CustomEvent("oryvo:sync"));
}
function body(a: StoredActivity) {
  const { id, name, sport, startedAt, durationSec, distanceM, avgSpeed, maxSpeed, calories, elevGain, points, splits } = a;
  return { id, name, sport, startedAt, durationSec, distanceM, avgSpeed, maxSpeed, calories, elevGain, points: points ?? [], splits: splits ?? [] };
}
async function requireOK(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? `Synchronisation reportée (HTTP ${response.status}).`);
  }
}

async function performSync() {
  const marker = deviceToken().slice(0, 16);
  const locals = await idbGetAllActivities();
  for (const old of locals) {
    const activity = await idbGetActivity(old.id);
    if (!activity) continue;
    if (activity.deleted) {
      // Always send DELETE, even for an unsynced rename or an in-flight creation.
      const response = await apiFetch(`/api/activities/${encodeURIComponent(activity.id)}`, { method: "DELETE" });
      await requireOK(response);
      await idbMutateActivity(activity.id, (current) => current?.deleted ? null : undefined);
    } else if (!activity.synced || activity.syncOwner !== marker) {
      const response = await apiFetch("/api/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(activity)) });
      await requireOK(response);
      await idbMutateActivity(activity.id, (current) => {
        if (current && !current.deleted && current.name === activity.name && current.revision === activity.revision) {
          return { ...current, synced: true, syncOwner: marker };
        }
        again = true;
        return undefined;
      });
    }
  }
  let offset: number | null = 0;
  while (offset !== null) {
    const response = await apiFetch(`/api/activities?full=1&offset=${offset}`);
    await requireOK(response);
    const data = await response.json() as { items: ActivityRecord[]; nextOffset: number | null };
    if (!Array.isArray(data.items)) throw new Error("Réponse de synchronisation invalide.");
    for (const item of data.items) {
      await idbMutateActivity(item.id, (current) => {
        // Never resurrect tombstones or overwrite a pending local change.
        if (current) return undefined;
        return { ...item, synced: true, syncOwner: marker, revision: 0 };
      });
    }
    offset = typeof data.nextOffset === "number" && data.nextOffset > offset ? data.nextOffset : null;
  }
}

export function syncNow(): Promise<SyncReport> {
  if (typeof window === "undefined") return Promise.resolve(report);
  if (inFlight) { again = true; return inFlight; }
  if (!navigator.onLine) { update({ ...report, state: "offline" }); return Promise.resolve(report); }
  const run = async () => {
    update({ ...report, state: "syncing", error: undefined });
    try {
      let pass = 0;
      do {
        again = false;
        await performSync();
      } while (again && navigator.onLine && ++pass < 3);
      update({ state: "synced", lastSuccess: Date.now() });
    } catch (error) {
      update({ ...report, state: navigator.onLine ? "error" : "offline", error: error instanceof Error ? error.message : "Synchronisation reportée. Les données locales sont conservées." });
    }
    return report;
  };
  const work = (async () => {
    if (navigator.locks) return await navigator.locks.request("oryvo-sync-v2", run);
    return await run();
  })();
  inFlight = work.finally(() => { inFlight = null; });
  return inFlight;
}

export function startSyncEngine(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void syncNow());
  window.addEventListener("offline", () => update({ ...report, state: "offline" }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  setTimeout(() => void syncNow(), 300);
  setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) void syncNow(); }, 30000);
}

export async function deleteActivitySmart(id: string): Promise<void> {
  await idbMutateActivity(id, (current) => current ? { ...current, deleted: true, synced: false, revision: (current.revision ?? 0) + 1 } : undefined);
  void syncNow();
}
