"use client";

import { Bike, Footprints, Mountain, PersonStanding, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { SportType, TrackPoint } from "@/lib/types";

export const SPORT_ICON: Record<SportType, LucideIcon> = {
  run: Footprints,
  walk: PersonStanding,
  ride: Bike,
  hike: Mountain,
};

export const SPORT_TINT: Record<SportType, string> = {
  run: "text-flare",
  walk: "text-emerald-400",
  ride: "text-sky-400",
  hike: "text-amber-300",
};

export function Stat({
  label,
  value,
  unit,
  accent = false,
  size = "md",
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p
        className={`tabular mt-1 font-display font-extrabold italic leading-none ${
          size === "lg" ? "text-4xl" : "text-[26px]"
        } ${accent ? "text-gradient-flame" : "text-white"}`}
      >
        {value}
        {unit ? (
          <span className="ml-1 align-baseline text-[13px] font-bold not-italic text-white/45">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

export function GoalRing({
  progress,
  size = 88,
  stroke = 9,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringFlame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF8A00" />
            <stop offset="100%" stopColor="#FF5A00" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringFlame)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)", filter: "drop-shadow(0 0 6px rgba(255,90,0,0.55))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function WeekBars({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(1, ...data);
  const today = (new Date().getDay() + 6) % 7; // Monday = 0
  return (
    <div className="flex h-28 items-end gap-2.5">
      {data.map((v, i) => {
        const isToday = i === today;
        const h = v > 0 ? Math.max(8, (v / max) * 100) : 4;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-20 w-full items-end">
              <div
                className={`w-full rounded-md transition-all duration-700 ${
                  v > 0
                    ? isToday
                      ? "bg-gradient-to-t from-flame to-flare shadow-[0_0_14px_rgba(255,90,0,0.5)]"
                      : "bg-gradient-to-t from-flame/70 to-flare/70"
                    : "bg-white/[0.06]"
                }`}
                style={{ height: `${h}%` }}
              />
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isToday ? "text-flare" : "text-white/35"
              }`}
            >
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Tiny canvas thumbnail of the route shape. */
export function MiniRoute({ points, size = 88 }: { points: TrackPoint[]; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    if (!points || points.length < 2) return;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanLat = Math.max(maxLat - minLat, 1e-6);
    const spanLng = Math.max((maxLng - minLng) * kx, 1e-6);
    const pad = 10;
    const scale = Math.min((size - pad * 2) / spanLng, (size - pad * 2) / spanLat);
    const offX = (size - spanLng * scale) / 2;
    const offY = (size - spanLat * scale) / 2;
    const xy = points.map((p) => ({
      x: offX + (p.lng - minLng) * kx * scale,
      y: offY + (maxLat - p.lat) * scale,
      seg: p.seg,
    }));
    const passes: [string, number][] = [
      ["rgba(255,90,0,0.3)", 6],
      ["#FF6A00", 2.6],
      ["rgba(255,220,190,0.7)", 0.9],
    ];
    for (const [color, w] of passes) {
      ctx.beginPath();
      let prevSeg = -1;
      xy.forEach((p, i) => {
        if (i === 0 || p.seg !== prevSeg) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
        prevSeg = p.seg;
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(xy[0].x, xy[0].y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    const e = xy[xy.length - 1];
    ctx.beginPath();
    ctx.arc(e.x, e.y, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = "#FF5A00";
    ctx.fill();
  }, [points, size]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center rounded-3xl px-6 py-12 text-center">
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-flame/10">
        <div className="absolute inset-0 rounded-2xl bg-flame/10 blur-lg" />
        <Icon className="relative h-7 w-7 text-flare" />
      </div>
      <h3 className="font-display text-lg font-extrabold italic">{title}</h3>
      <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-white/50">{body}</p>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-1 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-white/40">{hint}</span> : null}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-flame shadow-[0_0_14px_rgba(255,90,0,0.5)]" : "bg-white/12"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all duration-200 ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const elements = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]') ?? []);
    elements()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const focusable = elements();
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div ref={panel} className="fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="glass safe-b relative w-full max-w-md animate-fade-up rounded-t-[28px] border-t border-white/10 p-6">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h3 className="font-display text-lg font-extrabold italic">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function SportChip({ sport, small = false }: { sport: SportType; small?: boolean }) {
  const Icon = SPORT_ICON[sport];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 ${
        small ? "px-2 py-1" : "px-3 py-1.5"
      }`}
    >
      <Icon className={`${small ? "h-3 w-3" : "h-3.5 w-3.5"} ${SPORT_TINT[sport]}`} />
    </span>
  );
}
