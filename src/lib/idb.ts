"use client";

import type { ActivityRecord, SportType, TrackPoint } from "./types";
const DB_NAME = "oryvo-db";
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Stockage local indisponible. Autorisez les données de site pour enregistrer une activité."));
  if (dbPromise) return dbPromise;
  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.open(DB_NAME, 1);
  } catch (error) {
    return Promise.reject(new Error("Stockage local bloqué sur cet appareil (navigation privée ?). Ouvrez ORYVO en navigation normale."));
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Stockage local bloqué. Fermez les autres onglets ORYVO ou désactivez la navigation privée, puis réessayez.")), 6000);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("activities")) database.createObjectStore("activities", { keyPath: "id" });
      if (!database.objectStoreNames.contains("kv")) database.createObjectStore("kv", { keyPath: "k" });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
      resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error ?? new Error("Stockage local inaccessible.")); };
    // iOS Safari : une autre instance (PWA) peut bloquer l'ouverture.
    request.onblocked = () => { clearTimeout(timer); reject(new Error("ORYVO est déjà ouvert dans un autre onglet ou une autre fenêtre. Fermez-le puis réessayez.")); };
  }).catch((error) => { dbPromise = null; throw error; });
  return dbPromise;
}

async function transaction<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Écriture locale impossible. Vérifiez l'espace disponible."));
  });
}

export type StoredActivity = ActivityRecord & {
  synced: boolean;
  deleted?: boolean;
  revision?: number;
  syncOwner?: string;
};

export async function idbPutActivity(activity: StoredActivity): Promise<void> {
  await transaction("activities", "readwrite", (s) => s.put(activity));
  emitDataChanged();
}

/** Atomic read-modify-write: a response from an old sync cannot erase a newer edit. */
export async function idbMutateActivity(id: string, mutate: (current: StoredActivity | undefined) => StoredActivity | null | undefined): Promise<void> {
  const database = await openDB();
  let changed = false;
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("activities", "readwrite");
    const store = tx.objectStore("activities");
    const request = store.get(id);
    request.onsuccess = () => {
      const next = mutate(request.result as StoredActivity | undefined);
      if (next === null) { store.delete(id); changed = true; }
      else if (next) { store.put(next); changed = true; }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Mise à jour locale impossible."));
  });
  if (changed) emitDataChanged();
}

export async function idbGetAllActivities(): Promise<StoredActivity[]> {
  return transaction("activities", "readonly", (s) => s.getAll());
}
export async function idbGetActivity(id: string): Promise<StoredActivity | null> {
  return (await transaction<StoredActivity | undefined>("activities", "readonly", (s) => s.get(id))) ?? null;
}
export async function idbRemoveActivity(id: string): Promise<void> {
  await transaction("activities", "readwrite", (s) => s.delete(id));
  emitDataChanged();
}

export interface SessionSnapshot {
  id?: string;
  points: TrackPoint[];
  startTs: number;
  pausedTotal: number;
  pauseStart: number | null;
  status: string;
  sport: SportType;
  seg: number;
  savedAt: number;
  elapsedMs?: number;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await transaction("kv", "readwrite", (s) => s.put({ k: key, v: value }));
}
export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await transaction<{ k: string; v: T } | undefined>("kv", "readonly", (s) => s.get(key));
  return row?.v ?? null;
}

/** Store the final activity and clear its recovery snapshot in ONE transaction. */
export async function commitActivity(activity: StoredActivity): Promise<void> {
  const database = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(["activities", "kv"], "readwrite");
    tx.objectStore("activities").put(activity);
    tx.objectStore("kv").put({ k: "oryvo:session", v: null });
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Sauvegarde impossible. Votre séance reste récupérable."));
  });
  emitDataChanged();
}

export function emitDataChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("oryvo:data"));
}
