import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Deterministic tile fixture: automated GPS tests do not scrape a public tile server.
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tile }));
  await page.addInitScript(() => {
    window.__runtimeErrors = [];
    window.addEventListener('error', (event) => { if (event.error) window.__runtimeErrors.push(String(event.error)); });
    window.addEventListener('unhandledrejection', (event) => window.__runtimeErrors.push(String(event.reason)));
    sessionStorage.setItem('oryvo-welcomed', '1');
    if (!localStorage.getItem('oryvo-profile')) localStorage.setItem('oryvo-profile', JSON.stringify({ name: 'Athlète test', weightKg: 70, weeklyGoalKm: 20, autoPause: false }));
    let success;
    let failure;
    window.__emitGps = (latitude = 48.8566, longitude = 2.3522, accuracy = 5) => success?.({ coords: { latitude, longitude, accuracy, altitude: 30, altitudeAccuracy: 5, heading: null, speed: null }, timestamp: Date.now() });
    window.__gpsError = (code = 2) => failure?.({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'GPS test' });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(ok, error) { success = ok; failure = error; setTimeout(() => window.__gpsDenied ? window.__gpsError(1) : window.__emitGps(), 50); return 1; },
      clearWatch() { success = undefined; failure = undefined; },
      getCurrentPosition(ok) { ok({ coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 5 }, timestamp: Date.now() }); },
    } });
  });
});

async function locals(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('oryvo-db', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise((resolve, reject) => { const r = db.transaction('activities').objectStore('activities').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); return rows;
  });
}
async function noErrors(page) { expect(await page.evaluate(() => window.__runtimeErrors ?? [])).toEqual([]); }
async function readyOffline(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    const names = await caches.keys();
    const current = names.find((name) => name.startsWith('oryvo-v2-') && name.endsWith('-static'));
    return current && !!(await (await caches.open(current)).match('/activity'));
  });
}
async function record(page, steps = 8) {
  await page.goto('/record');
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled();
  await page.clock.install({ time: Date.now() });
  await page.getByRole('button', { name: 'Démarrer', exact: true }).click();
  for (let i = 1; i <= steps; i++) {
    await page.clock.runFor(1000);
    await page.evaluate((step) => window.__emitGps(48.8566 + step * 0.000035), i);
  }
  await expect(page.getByTestId('live-distance')).not.toContainText('0,00');
}
async function finish(page) {
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Activité enregistrée' })).toBeVisible();
}
async function token(page) { return page.evaluate(() => localStorage.getItem('oryvo-device-token-v2')); }

test.afterEach(async ({ page, request, context }) => {
  // Remove only activities owned by this isolated test browser, never other users.
  try {
    await context.setOffline(false);
    const value = await token(page);
    if (!value) return;
    const headers = { Authorization: `Bearer ${value}` };
    const response = await request.get('/api/activities?full=1', { headers });
    if (response.ok()) for (const a of (await response.json()).items) await request.delete(`/api/activities/${a.id}`, { headers });
  } catch { /* A blocked-storage test deliberately has no device credential. */ }
});

test('API validation, idempotency and ownership isolation', async ({ request }) => {
  const a = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
  const b = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
  const id = randomUUID();
  const startedAt = Date.now() - 60000;
  const data = { id, name: 'Course API privée', sport: 'run', startedAt, durationSec: 60, distanceM: 100, avgSpeed: 1.666, maxSpeed: 2, calories: 10, elevGain: 0, points: [{ lat: 48.85, lng: 2.35, t: startedAt, seg: 0, acc: 5 }, { lat: 48.851, lng: 2.35, t: startedAt + 50000, seg: 0, acc: 5 }], splits: [] };
  try {
    expect((await request.get('/api/activities')).status()).toBe(401);
    expect((await request.post('/api/activities', { headers: a, data: null })).status()).toBe(400);
    expect((await request.post('/api/activities', { headers: a, data: { ...data, points: [null] } })).status()).toBe(400);
    expect((await request.post('/api/activities', { headers: a, data })).ok()).toBe(true);
    expect((await request.post('/api/activities', { headers: a, data })).ok()).toBe(true);
    expect((await (await request.get('/api/activities', { headers: a })).json()).items).toHaveLength(1);
    expect((await (await request.get('/api/activities', { headers: b })).json()).items).toHaveLength(0);
    expect((await request.get(`/api/activities/${id}`, { headers: b })).status()).toBe(404);
    expect((await request.patch(`/api/activities/${id}`, { headers: b, data: { name: 'Unauthorized' } })).status()).toBe(404);
    expect((await request.delete(`/api/activities/${id}`, { headers: b })).ok()).toBe(true);
    expect((await request.get(`/api/activities/${id}`, { headers: a })).status()).toBe(200);
    expect((await request.patch(`/api/activities/${id}`, { headers: a, data: { name: 'Renommée' } })).ok()).toBe(true);
    const item = (await (await request.get(`/api/activities/${id}`, { headers: a })).json()).item;
    expect(item.name).toBe('Renommée');
    expect(typeof item.createdAt).toBe('number');
    expect(item.ownerHash).toBeUndefined();
  } finally { await request.delete(`/api/activities/${id}`, { headers: a }); }
});

test('mobile recorder: visible controls, pause, lost GPS recovery, save and exports', async ({ page }, info) => {
  await record(page, 10);
  await expect(page.getByRole('region', { name: 'Carte du parcours' })).toBeVisible();
  expect(await page.locator('.leaflet-tile').evaluateAll((images) => images.every((image) => image.src.startsWith('https://tile.openstreetmap.org/')))).toBe(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedTime = await page.getByTestId('live-time').textContent();
  await page.clock.runFor(7000);
  await expect(page.getByTestId('live-time')).toHaveText(pausedTime);
  await page.getByRole('button', { name: 'Reprendre', exact: true }).click();
  await page.evaluate(() => window.__gpsError(2));
  await expect(page.getByText('Signal perdu', { exact: true })).toBeVisible();
  await page.clock.runFor(1000);
  await page.evaluate(() => window.__emitGps(48.85695));
  await expect(page.getByText('GPS excellent', { exact: true })).toBeVisible();
  await finish(page);
  await expect.poll(async () => (await locals(page)).filter((a) => a.synced).length).toBe(1);
  const [saved] = await locals(page);
  expect(saved.durationSec).toBeGreaterThanOrEqual(10);
  expect(saved.durationSec).toBeLessThan(16);
  expect(saved.points.length).toBeGreaterThan(5);
  expect(saved.distanceM).toBeGreaterThan(30);
  await page.screenshot({ path: info.outputPath('record-mobile.png') });
  await page.getByRole('link', { name: 'Voir le détail' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Course');
  const gpxPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GPX', exact: true }).click();
  const gpx = await gpxPromise;
  expect(gpx.suggestedFilename()).toMatch(/\.gpx$/);
  const xml = await readFile(await gpx.path(), 'utf8');
  expect(xml).toContain('<trkpt');
  const imagePromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  const image = await imagePromise;
  expect(image.suggestedFilename()).toMatch(/\.png$/);
  expect((await readFile(await image.path())).byteLength).toBeGreaterThan(10000);
  await noErrors(page);
});

test('offline recording, cold detail reload, navigation and deferred synchronization', async ({ page, context }) => {
  await page.goto('/');
  await readyOffline(page);
  await record(page, 6);
  await context.setOffline(true);
  await finish(page);
  await expect(page.getByText(/Sauvegardée sur cet appareil · synchronisation au retour du réseau/)).toBeVisible();
  expect((await locals(page))[0].synced).toBe(false);
  await page.getByRole('link', { name: 'Voir le détail' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Course');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Course');
  await page.getByRole('link', { name: 'Mes activités', exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Activités', exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/activity?id="]')).toHaveCount(1);
  await page.getByRole('navigation').getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.getByText('Statistiques cumulées')).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Synchroniser maintenant', exact: true }).click();
  await expect.poll(async () => (await locals(page)).filter((a) => a.synced).length).toBe(1);
  await expect(page.getByText('Synchronisation terminée', { exact: true })).toBeVisible();
  await noErrors(page);
});

test('server failure never acknowledges a rename/delete and retry completes safely', async ({ page, request }) => {
  await record(page, 5); await finish(page);
  await expect.poll(async () => (await locals(page))[0]?.synced).toBe(true);
  const id = (await locals(page))[0].id;
  const headers = { Authorization: `Bearer ${await token(page)}` };
  await page.route('**/api/activities**', (route) => route.fulfill({ status: 503, json: { error: 'Serveur temporairement indisponible' } }));
  await page.getByRole('link', { name: 'Voir le détail' }).click();
  await page.getByRole('heading', { level: 1 }).click();
  await page.getByLabel("Nouveau nom de l'activité").fill('Sortie renommée hors réseau');
  await page.getByRole('button', { name: 'Valider le nom' }).click();
  await expect.poll(async () => (await locals(page))[0]?.name).toBe('Sortie renommée hors réseau');
  await expect.poll(async () => (await locals(page))[0]?.synced).toBe(false);
  await page.getByRole('button', { name: "Supprimer l'activité", exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Activités', exact: true })).toBeVisible();
  expect((await locals(page))[0].deleted).toBe(true);
  expect((await request.get(`/api/activities/${id}`, { headers })).status()).toBe(200);
  await page.unroute('**/api/activities**');
  await page.getByRole('button', { name: /Synchronisation/ }).click();
  await expect.poll(async () => (await locals(page)).length).toBe(0);
  expect((await request.get(`/api/activities/${id}`, { headers })).status()).toBe(404);
  await noErrors(page);
});

test('denied GPS is explained and retry works without a reload', async ({ page }) => {
  await page.addInitScript(() => { window.__gpsDenied = true; });
  await page.goto('/record');
  await expect(page.getByText(/La localisation est refusée/)).toBeVisible();
  await expect(page.getByRole('button', { name: /En attente du GPS/ })).toBeDisabled();
  await expect(page.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();
  await page.evaluate(() => { window.__gpsDenied = false; });
  await page.getByRole('button', { name: 'Réessayer le GPS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled();
  await noErrors(page);
});

test('session survives reload without counting closed time; another tab cannot overwrite it', async ({ page, context }) => {
  await record(page, 5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frozen = await page.getByTestId('live-time').textContent();
  await page.clock.runFor(3000);
  const other = await context.newPage();
  await other.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: tile }));
  await other.goto('/record');
  await expect(other.getByText(/Une séance est déjà ouverte/)).toBeVisible();
  await other.close();
  await page.reload();
  await expect(page.getByText(/Séance récupérée/)).toBeVisible();
  await expect(page.getByTestId('live-time')).toHaveText(frozen);
  await page.getByRole('button', { name: 'Abandonner la séance' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeEnabled();
  await noErrors(page);
});

test('blocked browser storage shows a useful error instead of a spinner or false save', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open() { throw new DOMException('Storage blocked', 'SecurityError'); } } }));
  await page.goto('/record');
  await expect(page.getByText(/Stockage local inaccessible/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Vérification du stockage/ })).toBeDisabled();
  await page.getByRole('link', { name: "Retour à l'accueil" }).click();
  await expect(page.getByText(/Stockage local indisponible/)).toBeVisible();
  await noErrors(page);
});

test('desktop navigation and profile settings persist without horizontal overflow', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/profile');
  const name = page.getByLabel("Nom de l'athlète");
  await name.fill('Camille'); await name.blur();
  await page.getByRole('switch').click();
  await page.reload();
  await expect(name).toHaveValue('Camille');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('navigation').getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cette semaine', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('home-desktop.png'), fullPage: true });
  await noErrors(page);
});
