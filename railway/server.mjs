import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const required = ["DATABASE_URL", "ADMIN_PASSWORD", "SESSION_SECRET", "VOTE_SECRET", "AUDIENCE_ORIGIN"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const root = dirname(fileURLToPath(import.meta.url));
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.css", ["app.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

await pool.query(`
  CREATE TABLE IF NOT EXISTS songs (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    performer TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_open_song ON songs (status) WHERE status = 'open';
  CREATE TABLE IF NOT EXISTS votes (
    id BIGSERIAL PRIMARY KEY,
    song_id BIGINT NOT NULL REFERENCES songs(id),
    device_hash CHAR(64) NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (song_id, device_hash)
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    address_hash CHAR(64) PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    last_attempt BIGINT NOT NULL
  );
`);

function hmac(value, secret) { return createHmac("sha256", secret).update(value).digest("hex"); }
function equal(a, b) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
function response(res, status, data, extra = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(JSON.stringify(data));
}
function cors(req, res) {
  if (req.headers.origin === process.env.AUDIENCE_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", process.env.AUDIENCE_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
}
function sameOrigin(req) {
  const protocol = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "https" : "http";
  return req.headers.origin === `${protocol}://${req.headers.host}`;
}
function sessionCookie(req, token) {
  const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "Secure; " : "";
  return `poll_admin=${token}; HttpOnly; ${secure}SameSite=Strict; Path=/; Max-Age=28800`;
}
function newSession(req) {
  const value = `${Date.now() + 8 * 60 * 60 * 1000}.${randomUUID()}`;
  return sessionCookie(req, `${value}.${hmac(value, process.env.SESSION_SECRET)}`);
}
function isAdmin(req) {
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("poll_admin="))?.slice(11);
  const match = /^(\d+)\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(cookie ?? "");
  if (!match || Number(match[1]) < Date.now()) return false;
  return equal(match[3], hmac(`${match[1]}.${match[2]}`, process.env.SESSION_SECRET));
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16384) throw Object.assign(new Error("Request too large."), { status: 413 });
  }
  try { return JSON.parse(raw || "{}"); }
  catch { throw Object.assign(new Error("Invalid JSON."), { status: 400 }); }
}
async function state(includeLive = false) {
  const [open, results, next] = await Promise.all([
    pool.query("SELECT id, number, performer FROM songs WHERE status = 'open' ORDER BY number DESC LIMIT 1"),
    pool.query("SELECT s.number, s.performer, COALESCE(SUM(v.score), 0)::integer AS total, COUNT(v.id)::integer AS votes FROM songs s LEFT JOIN votes v ON v.song_id = s.id WHERE s.status = 'closed' GROUP BY s.id ORDER BY total DESC, s.number ASC"),
    pool.query("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM songs"),
  ]);
  const data = { open: open.rows[0] ?? null, results: results.rows, nextNumber: next.rows[0].next };
  if (includeLive) {
    const live = data.open ? await pool.query("SELECT COALESCE(SUM(score), 0)::integer AS total, COUNT(*)::integer AS votes FROM votes WHERE song_id = $1", [data.open.id]) : null;
    return { ...data, live: live?.rows[0] ?? { total: 0, votes: 0 } };
  }
  return data;
}
async function startSong(name) {
  const performer = String(name ?? "").trim();
  if (!performer || performer.length > 80) throw Object.assign(new Error("Enter a performer name (up to 80 characters)."), { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(6283401)");
    const open = await client.query("SELECT id FROM songs WHERE status = 'open' LIMIT 1");
    if (open.rowCount) throw Object.assign(new Error("Close the current song before starting the next one."), { status: 409 });
    const next = await client.query("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM songs");
    await client.query("INSERT INTO songs (number, performer) VALUES ($1, $2)", [next.rows[0].next, performer]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return state(true);
}
async function closeSong(id) {
  if (!Number.isInteger(id)) throw Object.assign(new Error("Invalid song."), { status: 400 });
  const result = await pool.query("UPDATE songs SET status = 'closed', closed_at = NOW() WHERE id = $1 AND status = 'open' RETURNING id", [id]);
  if (!result.rowCount) throw Object.assign(new Error("This song is already closed or no longer current."), { status: 409 });
  return state(true);
}
async function submitVote(songId, score, deviceId) {
  if (!Number.isInteger(songId) || !Number.isInteger(score) || score < 0 || score > 20 || !/^[a-f0-9-]{36}$/.test(deviceId)) {
    throw Object.assign(new Error("Enter a whole-number score from 0 to 20."), { status: 400 });
  }
  const deviceHash = hmac(deviceId, process.env.VOTE_SECRET);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const song = await client.query("SELECT id, status FROM songs WHERE id = $1 FOR SHARE", [songId]);
    if (!song.rowCount || song.rows[0].status !== "open") throw Object.assign(new Error("Voting for this song has closed. Refresh for the current song."), { status: 400 });
    const vote = await client.query("INSERT INTO votes (song_id, device_hash, score) VALUES ($1, $2, $3) ON CONFLICT (song_id, device_hash) DO NOTHING RETURNING id", [songId, deviceHash, score]);
    if (!vote.rowCount) throw Object.assign(new Error("This device has already voted for this song."), { status: 409 });
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return { ok: true };
}
async function login(req, password) {
  const address = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
  const addressHash = hmac(address, process.env.VOTE_SECRET);
  const now = Date.now();
  const attempt = await pool.query("SELECT count, last_attempt FROM login_attempts WHERE address_hash = $1", [addressHash]);
  if (attempt.rowCount && attempt.rows[0].count >= 5 && now - Number(attempt.rows[0].last_attempt) < 900000) {
    throw Object.assign(new Error("Too many attempts. Try again in 15 minutes."), { status: 429 });
  }
  const expected = hmac(process.env.ADMIN_PASSWORD, process.env.SESSION_SECRET);
  const actual = hmac(String(password ?? ""), process.env.SESSION_SECRET);
  if (!equal(expected, actual)) {
    await pool.query("INSERT INTO login_attempts (address_hash, count, last_attempt) VALUES ($1, 1, $2) ON CONFLICT (address_hash) DO UPDATE SET count = CASE WHEN $2 - login_attempts.last_attempt > 900000 THEN 1 ELSE login_attempts.count + 1 END, last_attempt = $2", [addressHash, now]);
    throw Object.assign(new Error("Incorrect password."), { status: 401 });
  }
  await pool.query("DELETE FROM login_attempts WHERE address_hash = $1", [addressHash]);
  return { ok: true, cookie: newSession(req) };
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, `http://${req.headers.host}`).pathname;
  try {
    if (path === "/health") { await pool.query("SELECT 1"); return response(res, 200, { ok: true }); }
    if (path.startsWith("/api/public/")) cors(req, res);
    if (req.method === "OPTIONS" && path.startsWith("/api/public/")) { res.writeHead(204); return res.end(); }
    if (req.method === "GET" && path === "/api/public/state") return response(res, 200, await state());
    if (req.method === "POST" && path === "/api/public/vote") {
      const data = await body(req);
      if (typeof data.score !== "number" || !Number.isInteger(data.score)) return response(res, 400, { error: "Enter a whole-number score from 0 to 20." });
      return response(res, 200, await submitVote(Number(data.songId), Number(data.score), String(data.deviceId ?? "")));
    }
    if (req.method === "GET" && path === "/api/admin/session") return response(res, 200, { authenticated: isAdmin(req) });
    if (req.method === "GET" && path === "/api/admin/state") return isAdmin(req) ? response(res, 200, await state(true)) : response(res, 401, { error: "Sign in required." });
    if (req.method === "POST" && path.startsWith("/api/admin/")) {
      if (!sameOrigin(req)) return response(res, 403, { error: "Invalid origin." });
      const data = await body(req);
      if (path === "/api/admin/login") {
        const result = await login(req, data.password);
        return response(res, 200, { ok: true }, { "Set-Cookie": result.cookie });
      }
      if (path === "/api/admin/logout") return response(res, 200, { ok: true }, { "Set-Cookie": "poll_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });
      if (!isAdmin(req)) return response(res, 401, { error: "Sign in required." });
      if (path === "/api/admin/start") return response(res, 200, await startSong(data.performer));
      if (path === "/api/admin/close") return response(res, 200, await closeSong(Number(data.songId)));
    }
    if (req.method === "GET" && staticFiles.has(path)) {
      const [name, contentType] = staticFiles.get(path);
      const content = await readFile(join(root, "public", name));
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      return res.end(content);
    }
    response(res, 404, { error: "Not found." });
  } catch (error) {
    if (!error.status || error.status >= 500) console.error("Request failed:", error);
    response(res, error.status ?? 500, { error: error.status ? error.message : "The poll is temporarily unavailable." });
  }
});
const port = Number(process.env.PORT ?? 3000);
server.listen(port, "0.0.0.0", () => console.log(`Audience scoring ready on port ${port}`));
process.on("SIGTERM", () => server.close(() => pool.end()));
