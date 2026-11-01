"use client";

import { useEffect, useState } from "react";
import { idbGetAllActivities } from "./idb";
import { deviceToken } from "./client-api";
import { getSyncReport, type SyncReport } from "./sync";

export interface SyncState {
  online: boolean;
  pending: number;
  ready: boolean;
  state: SyncReport["state"];
  error?: string;
}
export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>({ online: true, pending: 0, ready: false, state: "idle" });
  useEffect(() => {
    let alive = true;
    const compute = async () => {
      try {
        const marker = deviceToken().slice(0, 16);
        const all = await idbGetAllActivities();
        if (alive) setState({ online: navigator.onLine, pending: all.filter((a) => !a.synced || a.deleted || a.syncOwner !== marker).length, ready: true, ...getSyncReport() });
      } catch {
        if (alive) setState({ online: navigator.onLine, pending: 0, ready: true, state: "error", error: "Stockage local inaccessible." });
      }
    };
    void compute();
    const events = ["online", "offline", "oryvo:sync", "oryvo:data"];
    for (const event of events) window.addEventListener(event, compute);
    return () => { alive = false; for (const event of events) window.removeEventListener(event, compute); };
  }, []);
  return state;
}
