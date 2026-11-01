"use client";

import type { ActivityRecord, TrackPoint } from "./types";
import { fmtDuration, fmtKm, fmtPace, fmtShortDate } from "./format";
import { SPORT_LABEL } from "./types";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Fit track into a rect, preserving geo aspect ratio. Returns canvas coords. */
function project(points: TrackPoint[], x: number, y: number, w: number, h: number) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max((maxLng - minLng) * kx, 1e-6);
  const scale = Math.min(w / spanLng, h / spanLat);
  const offX = x + (w - spanLng * scale) / 2;
  const offY = y + (h - spanLat * scale) / 2;
  return points.map((p) => ({
    x: offX + (p.lng - minLng) * kx * scale,
    y: offY + (maxLat - p.lat) * scale,
    seg: p.seg,
  }));
}

function strokeRoute(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; seg: number }[]) {
  const passes: [string, number][] = [
    ["rgba(255,90,0,0.28)", 16],
    ["rgba(255,120,0,0.85)", 7],
    ["#FFD9B8", 2.5],
  ];
  for (const [color, width] of passes) {
    ctx.beginPath();
    let prevSeg = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0 || p.seg !== prevSeg) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
      prevSeg = p.seg;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

export async function renderShareCard(a: ActivityRecord): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Le navigateur ne permet pas de générer une image.");
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-archivo").trim() || "Arial";

  try {
    await Promise.race([
      (document.fonts?.ready ?? Promise.resolve()),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fonts fallback */
  }

  // Background
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, W, H);
  try {
    const hero = await loadImage("/images/hero-topo.png");
    ctx.globalAlpha = 0.9;
    ctx.drawImage(hero, 0, 0, W, H);
    ctx.globalAlpha = 1;
  } catch {
    /* offline: plain black is fine */
  }
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(8,8,8,0.82)");
  grad.addColorStop(0.45, "rgba(8,8,8,0.55)");
  grad.addColorStop(1, "rgba(8,8,8,0.94)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const ORANGE = "#FF5A00";
  const LIGHT = "#FF8A00";

  // Brand
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `italic 900 92px ${fontFamily}, Arial, sans-serif`;
  ctx.fillText("ORY", 72, 150);
  const w1 = ctx.measureText("ORY").width;
  const g2 = ctx.createLinearGradient(72 + w1, 0, 72 + w1 + 220, 0);
  g2.addColorStop(0, LIGHT);
  g2.addColorStop(1, ORANGE);
  ctx.fillStyle = g2;
  ctx.fillText("VO", 72 + w1 + 6, 150);
  ctx.font = `600 26px ${fontFamily}, Arial, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText("T R A C K   •   R U N   •   A C H I E V E", 76, 200);

  // Meta
  ctx.font = `700 34px ${fontFamily}, Arial, sans-serif`;
  ctx.fillStyle = LIGHT;
  const meta = `${SPORT_LABEL[a.sport].toUpperCase()}  •  ${fmtShortDate(a.startedAt).toUpperCase()}`;
  ctx.fillText(meta, 76, 290);

  // Route
  if (a.points?.length > 1) {
    const pts = project(a.points, 90, 360, W - 180, 520);
    // soften: subsample for very long tracks
    const stride = Math.max(1, Math.floor(pts.length / 1500));
    const sample = pts.filter((_, i) => i % stride === 0 || i === pts.length - 1);
    ctx.save();
    strokeRoute(ctx, sample);
    ctx.restore();
    // start / end markers
    const s = pts[0];
    const e = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.x, e.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.x, e.y, 26, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,90,0,0.5)";
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  // Big distance
  const km = fmtKm(a.distanceM);
  ctx.font = `italic 900 210px ${fontFamily}, Arial, sans-serif`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(km, 66, 1110);
  const wKm = ctx.measureText(km).width;
  ctx.font = `italic 800 64px ${fontFamily}, Arial, sans-serif`;
  ctx.fillStyle = LIGHT;
  ctx.fillText("KM", 78 + wKm, 1110);

  // Stat row
  const stats: [string, string][] = [
    ["DURÉE", fmtDuration(a.durationSec)],
    [a.sport === "ride" ? "VITESSE" : "ALLURE", a.sport === "ride" ? `${(a.avgSpeed * 3.6).toFixed(1)}` : `${fmtPace(a.avgSpeed)}`],
    ["CALORIES", String(a.calories)],
  ];
  let x = 76;
  stats.forEach(([label, value]) => {
    ctx.font = `600 26px ${fontFamily}, Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(label, x, 1190);
    ctx.font = `italic 800 58px ${fontFamily}, Arial, sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(value, x, 1256);
    x += 340;
  });

  // Footer bar
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, H - 14, W, 14);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

export async function shareActivity(a: ActivityRecord): Promise<"shared" | "downloaded"> {
  const blob = await renderShareCard(a);
  const file = new File([blob], `oryvo-${fmtKm(a.distanceM)}km.png`, { type: "image/png" });
  const text = `${a.name} — ${fmtKm(a.distanceM)} km en ${fmtDuration(a.durationSec)} avec ORYVO`;
  try {
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "ORYVO", text });
      return "shared";
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return "shared";
    /* fallthrough to download */
  }
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement("a");
  aEl.href = url;
  aEl.download = file.name;
  document.body.append(aEl);
  aEl.click();
  aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
