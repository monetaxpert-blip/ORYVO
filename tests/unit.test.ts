import test from "node:test";
import assert from "node:assert/strict";
import { TrackerEngine } from "../src/lib/tracker-engine";
import { computeSplits, elevationGain, haversineM, smoothedSpeeds, trackDistance } from "../src/lib/geo";
import { fmtPace } from "../src/lib/format";
import { activityToGpx } from "../src/lib/gpx";
import { parseActivity } from "../src/lib/server-activity";
import type { TrackPoint } from "../src/lib/types";

const T = Date.now() - 100000;
const point = (meters: number, seconds: number, seg = 0): TrackPoint => ({ lat: meters / 111194.92664455874, lng: 0, t: T + seconds * 1000, acc: 5, spd: null, alt: 10, seg });
const near = (actual: number, expected: number, tolerance = 0.03) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function started() {
  const engine = new TrackerEngine();
  engine.ingest(point(0, 0), T, false);
  engine.start("regression-session", T);
  return engine;
}

test("haversine is finite at zero and antipodes", () => {
  near(haversineM(0, 0, 0, 0), 0);
  near(haversineM(0, 0, 1, 0), 111194.9266, 0.1);
  assert.ok(Number.isFinite(haversineM(90, 0, -90, 180)));
});
test("start, movement, pause and finish use the actual active clock", () => {
  const e = started();
  e.ingest(point(30, 10), T + 10000, false);
  e.pause(T + 12000);
  near(e.elapsed(T + 92000), 12000);
  e.resume(T + 92000);
  e.ingest(point(300, 93), T + 93000, false);
  e.ingest(point(330, 103), T + 103000, false);
  e.pause(T + 105000);
  e.finish(T + 200000);
  const record = e.record("Test", T + 250000, 70);
  assert.equal(record.durationSec, 25);
  near(record.distanceM, 60);
  assert.equal(e.status, "finished");
  near(e.elapsed(T + 1000000), 25000);
});
test("outlier coordinates and old/inaccurate fixes cannot affect distance or live position", () => {
  const e = started();
  const old = e.lastFix;
  assert.equal(e.ingest({ ...point(0, 1), lat: 70 }, T + 1000, false), false);
  assert.equal(e.lastFix, old);
  assert.equal(e.ingest({ ...point(3, 1), acc: 200 }, T + 1000, false), false);
  assert.equal(e.ingest(point(3, 1), T + 90000, false), false);
  assert.equal(e.ingest({ ...point(3, 1), lat: NaN }, T + 1000, false), false);
  near(e.distanceM, 0);
  e.ingest(point(6, 2), T + 2000, false);
  near(e.distanceM, 6);
});
test("GPS recovery creates a new segment, never a bridge through missing data", () => {
  const e = started();
  e.ingest(point(20, 5), T + 5000, false);
  e.ingest(point(2000, 30), T + 30000, false);
  e.ingest(point(2020, 35), T + 35000, false);
  near(e.distanceM, 40);
  assert.equal(e.segment, 1);
  near(trackDistance(e.points), 40);
});
test("auto-pause can resume after real movement", () => {
  const e = started();
  for (let s = 1; s <= 8; s++) e.ingest(point(0, s), T + s * 1000, true);
  assert.equal(e.status, "autopaused");
  const elapsed = e.elapsed(T + 8000);
  near(e.elapsed(T + 20000), elapsed);
  e.ingest(point(8, 9), T + 9000, true);
  assert.equal(e.status, "tracking");
  assert.equal(e.segment, 1);
});
test("signal loss is not falsely treated as stationary auto-pause", () => {
  const e = started();
  e.tick(T + 20000, true);
  assert.equal(e.status, "tracking");
  assert.equal(e.speed, 0);
});
test("reload recovery excludes downtime, including a session with no distance", () => {
  const e = started();
  const snapshot = e.snapshot(T + 9000);
  const recovered = new TrackerEngine();
  recovered.restore(snapshot, "fallback-id");
  assert.equal(recovered.id, e.id);
  assert.equal(recovered.status, "paused");
  near(recovered.elapsed(T + 10000000), 9000);
  recovered.resume(T + 10000000);
  near(recovered.elapsed(T + 10004000), 13000);
});
test("legacy snapshot recovery excludes both manual pause and closed-tab time", () => {
  const e = new TrackerEngine();
  e.restore({ points: [], startTs: T, pausedTotal: 2000, pauseStart: T + 10000, status: "paused", sport: "walk", seg: 0, savedAt: T + 15000 }, "legacy-restored");
  assert.equal(e.elapsed(T + 999999), 8000);
});
test("kilometer splits carry partial progress across a pause", () => {
  const splits = computeSplits([point(0, 0), point(500, 100), point(500, 3700, 1), point(1001, 3800.2, 1)]);
  assert.equal(splits.length, 1);
  assert.equal(splits[0].km, 1);
  assert.equal(splits[0].sec, 200);
});
test("splits interpolate multiple crossings in one sample interval", () => {
  const splits = computeSplits([point(0, 0), point(5000.1, 1000.02)]);
  assert.equal(splits.length, 5);
  assert.deepEqual(splits.map((s) => s.sec), [200, 200, 200, 200, 200]);
});
test("elevation and speed never bridge a pause", () => {
  const pts = [point(0, 0), { ...point(20, 5), alt: 15 }, { ...point(10000, 100, 1), alt: 900 }, { ...point(10020, 105, 1), alt: 905 }];
  assert.equal(elevationGain(pts), 10);
  assert.ok(smoothedSpeeds(pts).every((v) => v <= 4.001));
});
test("pace rounding cannot display 4:60", () => {
  assert.equal(fmtPace(1000 / 299.6), "5:00");
  assert.equal(fmtPace(0), "–");
});
test("GPX preserves gaps and escapes the activity name", () => {
  const e = started();
  e.ingest(point(20, 5), T + 5000, false);
  const a = e.record("<Course & sortie>", T + 5000, 70);
  a.points.push(point(2000, 40, 1));
  const xml = activityToGpx(a);
  assert.equal((xml.match(/<trkseg>/g) ?? []).length, 2);
  assert.ok(xml.includes("&#60;Course &#38; sortie&#62;"));
});
test("API validator rejects null, missing fields, negatives and malformed coordinates", () => {
  const e = started();
  e.ingest(point(20, 5), T + 5000, false);
  const a = e.record("Course valide", T + 5000, 70);
  assert.ok(parseActivity(a));
  assert.equal(parseActivity(null), null);
  assert.equal(parseActivity({}), null);
  assert.equal(parseActivity({ ...a, durationSec: -1 }), null);
  assert.equal(parseActivity({ ...a, name: "  " }), null);
  assert.equal(parseActivity({ ...a, points: [{ ...a.points[0], lat: 100 }] }), null);
  assert.equal(parseActivity({ ...a, points: [null] }), null);
  assert.equal(parseActivity({ ...a, points: [a.points[0], a.points[0]] }), null);
});
