"use client";

import { useCallback, useEffect, useState } from "react";
import { idbGetActivity, idbGetAllActivities, idbPutActivity, type StoredActivity } from "./idb";
import { apiFetch, deviceToken } from "./client-api";
import { syncNow } from "./sync";

export function useActivities() {
  const [items, setItems] = useState<StoredActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const all = await idbGetAllActivities();
      setItems(all.filter((a) => !a.deleted).sort((a, b) => b.startedAt - a.startedAt));
      setError(null);
    } catch {
      setError("Stockage local indisponible. Autorisez les données de site puis réessayez.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void reload();
    void syncNow().then(reload);
    const changed = () => void reload();
    window.addEventListener("oryvo:data", changed);
    window.addEventListener("oryvo:sync", changed);
    return () => {
      window.removeEventListener("oryvo:data", changed);
      window.removeEventListener("oryvo:sync", changed);
    };
  }, [reload]);
  return { items, loading, error, reload };
}

export async function getActivityHydrated(id: string): Promise<StoredActivity | null> {
  const local = await idbGetActivity(id);
  if (local?.deleted) return null;
  // Even a zero-distance activity is a real saved session, not a cache miss.
  if (local) return local;
  if (!navigator.onLine) return null;
  try {
    const response = await apiFetch(`/api/activities/${encodeURIComponent(id)}`);
    if (response.ok) {
      const { item } = await response.json() as { item: StoredActivity };
      if (item) {
        const record = { ...item, synced: true, syncOwner: deviceToken().slice(0, 16) };
        await idbPutActivity(record);
        return record;
      }
    }
  } catch { /* No local data is destroyed on a failed request. */ }
  return null;
}
