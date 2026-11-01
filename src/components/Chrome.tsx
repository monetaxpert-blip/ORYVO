"use client";

import { CloudCheck, CloudOff, CloudUpload, History, Home, Play, RefreshCw, User } from "lucide-react";
import Link from "./AppLink";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSyncState } from "@/lib/useSyncState";
import { syncNow } from "@/lib/sync";
import RegisterSW from "./RegisterSW";
import Splash from "./Splash";

function SyncPill() {
  const s = useSyncState();
  if (!s.ready) return null;
  const pending = s.pending > 0;
  const error = s.state === "error";
  const syncing = s.state === "syncing";
  const Icon = !s.online ? CloudOff : error ? RefreshCw : pending || syncing ? CloudUpload : CloudCheck;
  const label = !s.online ? "Hors ligne" : error ? "À réessayer" : syncing ? "Synchro…" : pending ? `${s.pending} en attente` : s.state === "synced" ? "Synchronisé" : "Vérification";
  return <button type="button" onClick={() => void syncNow()} disabled={syncing || !s.online} aria-label={`Synchronisation : ${label}`} title={s.error ?? "Synchroniser mes activités"} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${error || !s.online ? "border-flame/30 bg-flame/10 text-flare" : "border-white/10 bg-white/5 text-white/60"}`}><Icon className={`h-3.5 w-3.5 text-flare ${syncing ? "animate-breathe" : ""}`} />{label}</button>;
}

export default function Chrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const immersive = path.startsWith("/record");
  const nav = [
    { href: "/", label: "Accueil", icon: Home, active: path === "/" },
    { href: "/record", label: "Enregistrer", icon: Play, active: immersive },
    { href: "/activities", label: "Activités", icon: History, active: path.startsWith("/activit") },
    { href: "/profile", label: "Profil", icon: User, active: path === "/profile" },
  ];
  return <>
    <RegisterSW /><Splash />
    {!immersive && <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.05] bg-ink/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-md items-center justify-between px-5"><Link href="/" aria-label="ORYVO — Accueil" className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo.png" alt="" className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/10" /><span className="font-display text-xl font-black italic tracking-[0.14em]">ORY<span className="text-gradient-flame">VO</span></span>
    </Link><SyncPill /></div></header>}
    <main className={immersive ? "" : "pb-nav mx-auto w-full max-w-md pt-[calc(76px+env(safe-area-inset-top))]"}>{children}</main>
    {!immersive && <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"><div className="mx-auto flex h-[76px] max-w-md items-center justify-around px-3">{nav.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex h-full w-1/4 flex-col items-center justify-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider ${active ? "text-flare" : "text-white/45"}`}>{href === "/record" ? <span className="-mt-6 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-flare to-flame text-white shadow-glow"><Icon className="h-5 w-5 fill-white" /></span> : <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.9} />}<span>{label}</span></Link>)}</div></nav>}
  </>;
}
