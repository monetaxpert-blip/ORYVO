import { bigint, integer, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import type { SportType, SplitKm, TrackPoint } from "@/lib/types";

export const activities = pgTable("activities", {
  id: text("id").notNull(),
  // Old rows are retained under 'legacy', never exposed to anonymous visitors.
  ownerHash: text("owner_hash").notNull().default("legacy"),
  name: text("name").notNull(),
  sport: text("sport").$type<SportType>().notNull(),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  durationSec: integer("duration_sec").notNull(),
  distanceM: real("distance_m").notNull(),
  avgSpeed: real("avg_speed").notNull(),
  maxSpeed: real("max_speed").notNull(),
  calories: integer("calories").notNull(),
  elevGain: real("elev_gain").notNull().default(0),
  points: jsonb("points").$type<TrackPoint[]>().notNull().default([]),
  splits: jsonb("splits").$type<SplitKm[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.ownerHash, table.id] })]);

export type ActivityRow = typeof activities.$inferSelect;
