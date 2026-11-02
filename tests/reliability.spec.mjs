import { test, expect } from '@playwright/test';

const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eeeeee"/><path d="M0 80H256M80 0V256" stroke="#ccc" stroke-width="4"/></svg>';
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522, accuracy: 5 });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: tile }));
  await page.addInitScript(() => {
    sessionStorage.setItem('oryvo-welcomed', '1');
    localStorage.setItem('oryvo-profile', JSON.stringify({ name: '', weightKg: 70, weeklyGoalKm: 20, autoPause: false }));
  });
});
test.afterEach(async ({ page, request }) => {
  try {
    const value = await page.evaluate(() => localStorage.getItem('oryvo-device-token-v2'));
    if (!value) return;
    const headers = { Authorization: `Bearer ${value}` };
    const response = await request.get('/api/activities', { headers });
    if (response.ok()) for (const activity of (await response.json()).items) await request.delete(`/api/activities/${activity.id}`, { headers });
  } catch { /* No persisted activity in most reliability cases. */ }
});

test('new worker purges old CARTO cache, preserves unrelated caches and has no-store headers', async ({ page, request }) => {
  await page.goto('/manifest.webmanifest');
  await page.evaluate(async () => {
    await (await caches.open('oryvo-v1-tiles')).put('https://a.basemaps.cartocdn.com/dark_all/0/0/0.png', new Response('API KEY REQUIRED'));
    await (await caches.open('unrelated-cache-for-test')).put('/keep-me', new Response('keep'));
  });
  await page.goto('/');
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    const names = await caches.keys();
    return names.some((name) => name.startsWith('oryvo-v2-')) && !names.includes('oryvo-v1-tiles');
  });
  expect(await page.evaluate(() => caches.has('unrelated-cache-for-test'))).toBe(true);
  const worker = await request.get('/sw.js');
  expect(worker.headers()['cache-control']).toContain('no-store');
  expect(worker.headers()['service-worker-allowed']).toBe('/');
  expect(worker.headers()['x-content-type-options']).toBe('nosniff');
});

test('map outage does not block GPS, and map retry recovers', async ({ page }) => {
  const fail = (route) => route.abort('failed');
  await page.route('https://tile.openstreetmap.org/**', fail);
  await page.goto('/record');
  await expect(page.getByText('Fond de carte indisponible', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled();
  await page.unroute('https://tile.openstreetmap.org/**', fail);
  await page.getByRole('button', { name: 'Réessayer la carte' }).click();
  await expect(page.getByText('Fond de carte indisponible', { exact: false })).toHaveCount(0);
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled();
});

test('small and landscape screens keep controls accessible; confirmation focus is stable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/record');
  const start = page.getByRole('button', { name: 'Démarrer', exact: true });
  await expect(start).toBeEnabled();
  expect(await start.evaluate((button) => { const r = button.getBoundingClientRect(); return r.bottom <= innerHeight; })).toBe(true);
  await start.click();
  await page.setViewportSize({ width: 640, height: 360 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Abandonner la séance' }).click();
  const dialog = page.getByRole('dialog');
  const cancel = dialog.getByRole('button', { name: 'Annuler', exact: true });
  await cancel.focus();
  await page.waitForTimeout(900);
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Activité enregistrée' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('record: storage and locks frozen (iOS) never block Démarrer; keepalive audio starts', async ({ page }) => {
  await page.addInitScript(() => {
    // IndexedDB qui ne rappelle JAMAIS success/error (hang iOS simulé)
    Object.defineProperty(indexedDB, 'open', { value: () => ({ result: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null }), configurable: true });
    // navigator.locks qui ne rappelle jamais le callback
    Object.defineProperty(navigator, 'locks', { value: { request: () => new Promise(() => {}) }, configurable: true });
    // capter les starts d'AudioContext (keepalive)
    window.__audioStarts = 0;
    const AC = window.AudioContext;
    window.AudioContext = class extends AC { constructor(...args) { super(...args); window.__audioStarts++; } };
  });
  await page.goto('/record');
  // le bouton ne doit plus être figé sur « Vérification du stockage… »
  await expect(page.getByRole('button', { name: /Vérification du stockage/ })).toHaveCount(0, { timeout: 20000 });
  // un message de stockage clair s'affiche (filet de sécurité ou échec explicite)
  await expect(page.getByText(/Stockage (principal non confirmé|local inaccessible)/)).toBeVisible({ timeout: 20000 });
  // avec le fix GPS simulé, Démarrer devient actif malgré le stockage gelé
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled({ timeout: 20000 });
  await page.getByRole('button', { name: 'Démarrer', exact: true }).click();
  expect(await page.evaluate(() => window.__audioStarts)).toBe(1); // keepalive démarré dans le geste
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  // Repli garanti : l'activité est conservée dans la file de secours (localStorage)
  await expect(page.getByRole('heading', { name: 'Activité enregistrée' })).toBeVisible({ timeout: 45000 });
  await expect(page.getByText(/conservée dans la sauvegarde de secours/)).toBeVisible({ timeout: 45000 });
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('oryvo:pending-activities') ?? '[]'));
  expect(pending.length).toBe(1);
  expect(pending[0].distanceM).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => window.__audioStarts)).toBe(1); // pas de double AudioContext
});