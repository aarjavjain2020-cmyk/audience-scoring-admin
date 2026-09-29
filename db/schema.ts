import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const songs = sqliteTable("songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: integer("number").notNull().unique(),
  performer: text("performer").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull().default(""),
  closedAt: text("closed_at"),
});

export const votes = sqliteTable("votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  songId: integer("song_id").notNull().references(() => songs.id),
  deviceHash: text("device_hash").notNull(),
  score: integer("score").notNull(),
  createdAt: text("created_at").notNull().default(""),
}, (table) => [uniqueIndex("one_vote_per_device_song").on(table.songId, table.deviceHash)]);

export const loginAttempts = sqliteTable("login_attempts", {
  addressHash: text("address_hash").primaryKey(),
  count: integer("count").notNull().default(0),
  lastAttempt: integer("last_attempt").notNull(),
});
