"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PROFILE, type UserProfile } from "./types";
const KEY = "oryvo-profile";
function normalize(value: Partial<UserProfile> | null): UserProfile {
  const p = value ?? {};
  return { name: typeof p.name === "string" ? p.name.trim().slice(0, 40) : "",
    weightKg: typeof p.weightKg === "number" && Number.isFinite(p.weightKg) ? Math.min(140, Math.max(40, p.weightKg)) : 70,
    weeklyGoalKm: typeof p.weeklyGoalKm === "number" && Number.isFinite(p.weeklyGoalKm) ? Math.min(120, Math.max(5, p.weeklyGoalKm)) : 20,
    autoPause: typeof p.autoPause === "boolean" ? p.autoPause : true };
}
export function loadProfile(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try { return normalize(JSON.parse(localStorage.getItem(KEY) ?? "null")); }
  catch { return DEFAULT_PROFILE; }
}
export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(KEY, JSON.stringify(normalize(profile)));
  window.dispatchEvent(new CustomEvent("oryvo:profile"));
}
export function useProfile(): [UserProfile, (patch: Partial<UserProfile>) => void, boolean, string | null] {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setProfile(loadProfile()); setReady(true);
    const changed = () => setProfile(loadProfile());
    window.addEventListener("oryvo:profile", changed);
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener("oryvo:profile", changed); window.removeEventListener("storage", changed); };
  }, []);
  const update = (patch: Partial<UserProfile>) => {
    const next = normalize({ ...loadProfile(), ...patch });
    try { saveProfile(next); setProfile(next); setError(null); }
    catch { setError("Préférences non enregistrées : autorisez le stockage de ce site et réessayez."); }
  };
  return [profile, update, ready, error];
}
