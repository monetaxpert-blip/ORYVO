"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Minus, Plus, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TrackPoint } from "@/lib/types";

// Public, keyless endpoint. Only viewport tiles are requested. The browser honors
// the provider's HTTP cache headers; the SW does NOT prefetch/cache map tiles.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

interface RouteMapProps {
  points: TrackPoint[];
  live?: { lat: number; lng: number; acc: number | null } | null;
  follow?: boolean;
  interactive?: boolean;
  fitKey?: string | number;
  className?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
}

function dot(color: string, pulse = false) {
  return L.divIcon({
    className: "",
    html: `<div class="${pulse ? "oryvo-live-dot" : ""}" style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 14px ${color}88"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

export default function RouteMap({
  points, live, follow = false, interactive = true, fitKey,
  className = "", initialCenter = [46.6, 1.9], initialZoom = 5,
}: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const route = useRef<L.LayerGroup | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const accuracy = useRef<L.Circle | null>(null);
  const fitted = useRef<string | number | null>(null);
  const centered = useRef(false);
  const userPanned = useRef(false);
  const [offline, setOffline] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, {
      zoomControl: false, attributionControl: false,
      dragging: interactive, touchZoom: interactive, doubleClickZoom: interactive,
      scrollWheelZoom: false, keyboard: interactive, zoomSnap: 0.5,
      minZoom: 2, maxZoom: 19,
    }).setView(initialCenter, initialZoom);
    const layer = L.tileLayer(TILE_URL, {
      maxZoom: 19, maxNativeZoom: 19, keepBuffer: 1,
      updateWhenIdle: true, updateWhenZooming: false,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    layer.on("tileerror", () => { setTileError(true); setLoading(false); });
    layer.on("tileload", () => { setTileError(false); setLoading(false); });
    map.current = m;
    tiles.current = layer;
    route.current = L.layerGroup().addTo(m);
    const network = () => {
      const off = !navigator.onLine;
      setOffline(off);
      if (off) {
        if (m.hasLayer(layer)) m.removeLayer(layer);
        setLoading(false);
      } else if (!m.hasLayer(layer)) {
        setLoading(true);
        layer.addTo(m);
      }
    };
    network();
    m.on("dragstart", () => { userPanned.current = true; });
    const observer = new ResizeObserver(() => m.invalidateSize({ pan: false }));
    observer.observe(container.current);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      observer.disconnect();
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      m.remove();
      map.current = null;
      tiles.current = null;
      route.current = null;
      marker.current = null;
      accuracy.current = null;
      fitted.current = null;
      centered.current = false;
    };
    // Map options are initialization-only. Data updates use the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = route.current;
    if (!m || !group) return;
    group.clearLayers();
    const valid = points.filter((p) => Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180);
    if (!valid.length) { fitted.current = null; return; }
    const segments: L.LatLngTuple[][] = [];
    let lastSeg = -1;
    for (const p of valid) {
      if (!segments.length || p.seg !== lastSeg) segments.push([]);
      segments[segments.length - 1].push([p.lat, p.lng]);
      lastSeg = p.seg;
    }
    for (const segment of segments) {
      if (segment.length < 2) continue;
      L.polyline(segment, { color: "#FF5A00", weight: 11, opacity: 0.2, interactive: false }).addTo(group);
      L.polyline(segment, { color: "#FF7800", weight: 4, opacity: 1, interactive: false }).addTo(group);
    }
    const first = valid[0], last = valid[valid.length - 1];
    L.marker([first.lat, first.lng], { icon: dot("#FFFFFF"), interactive: false }).addTo(group);
    if (!live) L.marker([last.lat, last.lng], { icon: dot("#FF5A00"), interactive: false }).addTo(group);
    const key = fitKey ?? "route";
    if (!follow && fitted.current !== key) {
      fitted.current = key;
      m.fitBounds(L.latLngBounds(valid.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [38, 38], maxZoom: 17, animate: false });
      centered.current = true;
    }
  }, [points, fitKey, follow, !!live]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!live) {
      marker.current?.remove(); marker.current = null;
      accuracy.current?.remove(); accuracy.current = null;
      return;
    }
    const ll: L.LatLngTuple = [live.lat, live.lng];
    if (!marker.current) marker.current = L.marker(ll, { icon: dot("#FF5A00", true), interactive: false, zIndexOffset: 1000 }).addTo(m);
    else marker.current.setLatLng(ll);
    if (live.acc != null && live.acc <= 200) {
      if (!accuracy.current) accuracy.current = L.circle(ll, { radius: live.acc, color: "#FF8A00", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(m);
      else accuracy.current.setLatLng(ll).setRadius(live.acc);
    } else { accuracy.current?.remove(); accuracy.current = null; }
    if (!centered.current || (follow && !userPanned.current)) {
      m.setView(ll, centered.current ? m.getZoom() : 16, { animate: false });
      centered.current = true;
    }
  }, [live, follow]);

  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => { setLoading(false); setTileError(true); }, 12000);
    return () => clearTimeout(timeout);
  }, [loading]);

  const recenter = () => {
    const m = map.current;
    if (!m) return;
    userPanned.current = false;
    if (live) m.setView([live.lat, live.lng], 16, { animate: true });
    else if (points.length) m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [38, 38], maxZoom: 17 });
  };

  return (
    <div className={`oryvo-map relative isolate h-full w-full overflow-hidden ${className}`} role="region" aria-label="Carte du parcours">
      <div ref={container} className="absolute inset-0 z-0" />
      {interactive && (
        <div className="absolute right-3 top-3 z-[1] flex flex-col gap-2">
          <button type="button" aria-label="Zoom avant" onClick={() => map.current?.zoomIn()} className="map-control"><Plus size={18} /></button>
          <button type="button" aria-label="Zoom arrière" onClick={() => map.current?.zoomOut()} className="map-control"><Minus size={18} /></button>
          <button type="button" aria-label="Recentrer le parcours" onClick={recenter} disabled={!live && !points.length} className="map-control disabled:opacity-40"><LocateFixed size={18} /></button>
        </div>
      )}
      {(offline || tileError || loading) && (
        <div role="status" className="absolute left-3 top-3 z-[1] max-w-[calc(100%-84px)] rounded-xl border border-white/10 bg-ink/90 px-3 py-2 text-[11px] leading-relaxed text-white/80 backdrop-blur-md">
          {offline ? <><WifiOff className="mb-1 h-4 w-4 text-flare" />Hors connexion · tracé GPS disponible<br /><span className="text-white/50">Fond de carte accessible avec Internet.</span></> : tileError ? <>Fond de carte indisponible<br /><span className="text-white/50">Le GPS reste indépendant de la carte.</span><button type="button" onClick={() => { setTileError(false); setLoading(true); tiles.current?.redraw(); }} className="mt-1 flex items-center gap-1 text-flare"><RefreshCw size={12} /> Réessayer la carte</button></> : "Chargement de la carte…"}
        </div>
      )}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="absolute bottom-0 right-0 z-[1] rounded-tl bg-ink/85 px-2 py-1 text-[10px] text-white/70">© OpenStreetMap contributors</a>
    </div>
  );
}
