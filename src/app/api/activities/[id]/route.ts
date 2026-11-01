import { db } from "@/db";
import { activities } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, ownerFromRequest, validId } from "@/lib/server-activity";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const ownerHash = ownerFromRequest(request);
  if (!ownerHash) return jsonError("Identifiant privé de l'appareil requis.", 401);
  const { id } = await params;
  if (!validId(id)) return jsonError("Identifiant invalide.", 400);
  try {
    const [row] = await db.select().from(activities).where(and(eq(activities.id, id), eq(activities.ownerHash, ownerHash))).limit(1);
    if (!row) return jsonError("Activité introuvable.", 404);
    const { ownerHash: _private, ...item } = row;
    void _private;
    return NextResponse.json({ item: { ...item, createdAt: item.createdAt.getTime() } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Serveur indisponible.", 503); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const ownerHash = ownerFromRequest(request);
  if (!ownerHash) return jsonError("Identifiant privé de l'appareil requis.", 401);
  const { id } = await params;
  if (!validId(id)) return jsonError("Identifiant invalide.", 400);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("name" in body) || typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) return jsonError("Nom invalide.", 400);
  try {
    const rows = await db.update(activities).set({ name: body.name.trim() }).where(and(eq(activities.id, id), eq(activities.ownerHash, ownerHash))).returning({ id: activities.id });
    if (!rows.length) return jsonError("Activité introuvable.", 404);
    return NextResponse.json({ ok: true });
  } catch { return jsonError("Modification reportée.", 503); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const ownerHash = ownerFromRequest(request);
  if (!ownerHash) return jsonError("Identifiant privé de l'appareil requis.", 401);
  const { id } = await params;
  if (!validId(id)) return jsonError("Identifiant invalide.", 400);
  try {
    await db.delete(activities).where(and(eq(activities.id, id), eq(activities.ownerHash, ownerHash)));
    // Idempotent even if the activity was already removed. Never deletes others' data.
    return NextResponse.json({ ok: true });
  } catch { return jsonError("Suppression reportée au prochain accès réseau.", 503); }
}
