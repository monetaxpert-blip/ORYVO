"use client";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="mx-4 rounded-3xl border border-flame/30 bg-coal p-7 text-center"><p className="text-xs font-bold uppercase tracking-widest text-flare">ORYVO</p><h1 className="mt-3 font-display text-2xl font-black italic">Reprenons votre parcours</h1><p className="mt-3 text-sm leading-relaxed text-white/60">L’écran n’a pas pu se charger. Vos sauvegardes locales ne sont pas effacées. Une séance interrompue peut être récupérée dans Enregistrer.</p><button type="button" onClick={reset} className="mt-5 w-full rounded-xl bg-flame py-3 font-bold">Réessayer</button><a href="/record" className="mt-4 block text-sm text-white/60">Revenir à ma séance</a></section>;
}
