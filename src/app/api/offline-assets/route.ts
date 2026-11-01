import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only public build assets, never source, environment files, or user data. */
export async function GET() {
  try {
    const root = path.join(process.cwd(), ".next", "static");
    const files = await readdir(root, { recursive: true });
    const assets = files.filter((file) => /\.(js|css|woff2?|ttf|png|svg)$/.test(file)).map((file) => `/_next/static/${file.split(path.sep).join("/")}`);
    return NextResponse.json({ assets }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Préparation hors ligne indisponible." }, { status: 503 });
  }
}
