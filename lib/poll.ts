import { env } from "cloudflare:workers";

type Row = Record<string, unknown>;

function db(): D1Database {
  if (!env.DB) throw new Error("Vote database unavailable");
  return env.DB;
}

export async function publicState() {
  const open = await db().prepare("SELECT id, number, performer FROM songs WHERE status = 'open' ORDER BY number DESC LIMIT 1").first<Row>();
  const results = await db().prepare("SELECT s.number, s.performer, COALESCE(SUM(v.score), 0) AS total, COUNT(v.id) AS votes FROM songs s LEFT JOIN votes v ON v.song_id = s.id WHERE s.status = 'closed' GROUP BY s.id ORDER BY total DESC, s.number ASC").all<Row>();
  return { open: open ?? null, results: results.results, nextNumber: await nextNumber() };
}

export async function adminState() {
  const state = await publicState();
  const live = state.open ? await db().prepare("SELECT COALESCE(SUM(score), 0) AS total, COUNT(*) AS votes FROM votes WHERE song_id = ?").bind(state.open.id).first<Row>() : null;
  return { ...state, live: live ?? { total: 0, votes: 0 } };
}

async function nextNumber(): Promise<number> {
  const row = await db().prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM songs").first<{ next: number }>();
  return row?.next ?? 1;
}

export async function startSong(performer: string) {
  if (!performer || performer.length > 80) throw new Error("Enter a performer name (up to 80 characters).");
  const open = await db().prepare("SELECT id FROM songs WHERE status = 'open' LIMIT 1").first();
  if (open) throw new Error("Close the current song before starting the next one.");
  const number = await nextNumber();
  await db().prepare("INSERT INTO songs (number, performer, status, created_at) VALUES (?, ?, 'open', ?)").bind(number, performer, new Date().toISOString()).run();
  return adminState();
}

export async function closeSong(songId: number) {
  const result = await db().prepare("UPDATE songs SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'").bind(new Date().toISOString(), songId).run();
  if (result.meta.changes !== 1) throw new Error("This song is already closed or no longer current.");
  return adminState();
}

export async function submitVote(songId: number, score: number, deviceHash: string) {
  if (!Number.isInteger(songId) || !Number.isInteger(score) || score < 0 || score > 20 || !/^[a-f0-9]{64}$/.test(deviceHash)) {
    throw new Error("Enter a whole-number score from 0 to 20.");
  }
  try {
    const result = await db().prepare("INSERT INTO votes (song_id, device_hash, score, created_at) SELECT id, ?, ?, ? FROM songs WHERE id = ? AND status = 'open'").bind(deviceHash, score, new Date().toISOString(), songId).run();
    if (result.meta.changes !== 1) throw new Error("Voting for this song has closed. Refresh for the current song.");
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new Error("This device has already voted for this song.");
    throw error;
  }
  return { ok: true };
}
