import type { ActivityRecord } from "./types";

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
export function activityToGpx(activity: ActivityRecord): string {
  const segments: string[][] = [];
  let previousSegment = -1;
  for (const point of activity.points) {
    if (!segments.length || point.seg !== previousSegment) segments.push([]);
    segments[segments.length - 1].push(`<trkpt lat="${point.lat.toFixed(7)}" lon="${point.lng.toFixed(7)}">${point.alt != null && Number.isFinite(point.alt) ? `<ele>${point.alt.toFixed(1)}</ele>` : ""}<time>${new Date(point.t).toISOString()}</time></trkpt>`);
    previousSegment = point.seg;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ORYVO" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(activity.name)}</name><time>${new Date(activity.startedAt).toISOString()}</time></metadata><trk><name>${escapeXml(activity.name)}</name>${segments.map((points) => `<trkseg>${points.join("\n")}</trkseg>`).join("\n")}</trk></gpx>`;
}
export function downloadGpx(activity: ActivityRecord): void {
  const blob = new Blob([activityToGpx(activity)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `oryvo-${new Date(activity.startedAt).toISOString().slice(0, 10)}.gpx`;
  document.body.append(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
