import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL est requis — copier .env.example vers .env (voir README).");

// DATABASE_URL provient du fichier .env (local) ou de l'environnement de production (Vercel).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
