"use client";

const TOKEN_KEY = "oryvo-device-token-v2";

// A private, high-entropy device credential. This is NOT a shared/public API key.
// It stays on this device; the server stores only its hash on activity rows.
export function deviceToken(): string {
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const value = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(TOKEN_KEY, value);
  return value;
}

function withTimeout(signal: AbortSignal | null): AbortSignal | undefined {
  if (signal) return signal;
  // AbortController manuel : AbortSignal.timeout est absent sur les iOS < 17.4.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Délai dépassé", "TimeoutError")), 15000);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${deviceToken()}`);
  return fetch(path, { ...init, headers, cache: "no-store", signal: withTimeout(init.signal ?? null) });
}
