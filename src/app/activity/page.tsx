"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ActivityDetail from "@/components/ActivityDetail";

function LocalActivity() {
  const params = useSearchParams();
  return <ActivityDetail activityId={params.get("id") ?? ""} />;
}
export default function LocalActivityPage() {
  return <Suspense fallback={<p className="px-6 py-8 text-sm text-white/50">Chargement de l’activité…</p>}><LocalActivity /></Suspense>;
}
