# ORYVO — Application sportive GPS (PWA)

**Track. Run. Achieve.** Enregistrement GPS premium : distance, durée, allure, vitesse,
calories, carte du parcours, historique, partage — même hors connexion.

- **Front** : Next.js 16 (App Router), Tailwind CSS 4, Leaflet, PWA (manifeste + Service Worker)
- **Stockage local** : IndexedDB (source de vérité hors-ligne, reprise de séance après crash)
- **Serveur** : API REST Next.js + PostgreSQL (Drizzle ORM), activités isolées par appareil
- **GPS** : filtrage des coordonnées aberrantes, segments après perte de signal,
  auto-pause, Wake Lock, récupération de session

## Développement local

```bash
npm install
cp .env.example .env        # renseigner DATABASE_URL
npx drizzle-kit push        # créer la table (une seule fois)
npm run dev
```

## Tests

```bash
npx tsx --test tests/unit.test.ts   # moteur GPS, splits, GPX, validation API
npx playwright test                 # 11 scénarios navigateur (Chromium requis)
```

## Mise en production (Vercel + Neon)

1. **GitHub** : pousser le code (le `.gitignore` exclut `.env`, `node_modules`, `.next`).
2. **Neon** (neon.tech) : créer un projet Postgres, copier la connection string pooler.
3. Créer la table de production (une fois) :
   `DATABASE_URL="postgres://…" npx drizzle-kit push`
4. **Vercel** : importer le repo → ajouter `DATABASE_URL` → Deploy.
5. HTTPS automatique (obligatoire pour la géolocalisation). Domaine personnalisé
   via Settings → Domains.

Chaque `git push` redéploie l'application.

## Notes PWA

- Au premier chargement, le Service Worker met le shell en cache (hors-ligne).
- Les fonds de carte OpenStreetMap nécessitent une connexion ; le tracé GPS,
  les statistiques et l'historique local restent disponibles sans réseau.
- Pendant une sortie, garder l'application au premier plan.
