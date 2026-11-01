"use client";

import { useEffect, useState } from "react";
export default function Splash() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("oryvo-welcomed")) return;
      sessionStorage.setItem("oryvo-welcomed", "1");
    } catch { return; }
    setVisible(true);
    const timeout = setTimeout(() => setVisible(false), 700);
    return () => clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  return <div className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink" aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/images/logo.png" alt="" className="h-32 w-32 rounded-[28px] object-cover shadow-glow" />
    <p className="mt-6 font-display text-4xl font-black italic tracking-[0.18em]">ORY<span className="text-gradient-flame">VO</span></p>
    <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">Track • Run • Achieve</p>
  </div>;
}
