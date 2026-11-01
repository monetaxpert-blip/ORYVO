import { db } from "@/db";
import { activities } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, ownerFromRequest, parseActivity } from "@/lib/server-activity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ownerHash = ownerFromRequest(request);
  if (!ownerHash) return jsonError("Identifiant privé de l'appareil requis.", 401);
  const full = request.nextUrl.searchParams.get("full") === "1";
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return jsonError("Pagination invalide.", 400);
  try {
    const rows = await db.select().from(activities).where(eq(activities.ownerHash, ownerHash))
      .orderBy(desc(activities.startedAt), desc(activities.id)).limit(100).offset(offset);
    const items = rows.map((row) => {
      const { ownerHash: _private, ...item } = row;
      void _private;
      return { ...item, points: full ? item.points : [], createdAt: item.createdAt.getTime() };
    });
    return NextResponse.json({ items, nextOffset: rows.length === 100 ? offset + 100 : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Serveur indisponible. Les activités restent sauvegardées sur votre appareil.", 503);
  }
}

export async function POST(request: NextRequest) {
  const ownerHash = ownerFromRequest(request);
  if (!ownerHash) return jsonError("Identifiant privé de l'appareil requis.", 401);
  const maxBytes = 16 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) return jsonError("Activité trop volumineuse.", 413);
  let value: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBytes) return jsonError("Activité trop volumineuse.", 413);
    value = JSON.parse(text);
  } catch { return jsonError("JSON invalide.", 400); }
  const activity = parseActivity(value);
  if (!activity) return jsonError("Données d'activité invalides.", 400);
  try {
    await db.insert(activities).values({ ...activity, ownerHash }).onConflictDoUpdate({
      target: [activities.ownerHash, activities.id],
      set: activity,
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Synchronisation reportée. Votre sauvegarde locale est conservée.", 503); }
}
