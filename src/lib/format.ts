/** French sport-formatting helpers. Always consistent, never localized by browser quirks. */

export function fmtKm(meters: number, digits = 2): string {
  return (meters / 1000).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** pace in min:ss /km from m/s */
export function fmtPace(mps: number): string {
  if (!isFinite(mps) || mps < 0.5) return "–";
  const secPerKm = 1000 / mps;
  if (secPerKm > 99 * 60) return "–";
  const rounded = Math.round(secPerKm);
  const mm = Math.floor(rounded / 60);
  const ss = rounded % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function fmtSpeed(mps: number, digits = 1): string {
  if (!isFinite(mps) || mps < 0) return "0";
  return (mps * 3.6).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function fmtDurationLong(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const hmFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function fmtDay(ts: number): string {
  return capitalize(dayFmt.format(new Date(ts)));
}

export function fmtShortDate(ts: number): string {
  return shortFmt.format(new Date(ts));
}

export function fmtTime(ts: number): string {
  return hmFmt.format(new Date(ts));
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function relDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return fmtShortDate(ts);
}

export function defaultActivityName(sportLabel: string, ts: number): string {
  const h = new Date(ts).getHours();
  let moment = "du soir";
  if (h >= 5 && h < 11) moment = "du matin";
  else if (h >= 11 && h < 15) moment = "du midi";
  else if (h >= 15 && h < 19) moment = "de l'après-midi";
  else if (h >= 23 || h < 5) moment = "de nuit";
  return `${sportLabel} ${moment}`;
}
