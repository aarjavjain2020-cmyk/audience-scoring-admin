const encoder = new TextEncoder();
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }
});
const fail = (message, status = 400) => json({ error: message }, status);

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)))].map(n => n.toString(16).padStart(2, "0")).join("");
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function cors(request, env) {
  return request.headers.get("Origin") === env.AUDIENCE_ORIGIN
    ? { "Access-Control-Allow-Origin": env.AUDIENCE_ORIGIN, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" }
    : {};
}
async function readBody(request) {
  if (Number(request.headers.get("Content-Length")) > 16384) throw { status: 413, message: "Request too large." };
  let value;
  try { value = await request.json(); } catch { throw { status: 400, message: "Invalid JSON." }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw { status: 400, message: "Invalid JSON." };
  return value;
}
async function isAdmin(request, env) {
  const cookie = request.headers.get("Cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith("poll_admin="))?.slice(11) || "";
  const match = /^(\d+)\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(cookie);
  if (!match || Number(match[1]) < Date.now()) return false;
  return equal(match[3], await hmac(`${match[1]}.${match[2]}`, env.SESSION_SECRET));
}
async function makeCookie(env) {
  const value = `${Date.now() + 8 * 60 * 60 * 1000}.${crypto.randomUUID()}`;
  return `poll_admin=${value}.${await hmac(value, env.SESSION_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`;
}
async function state(env, includeLive = false) {
  const open = await env.DB.prepare("SELECT id, number, performer FROM songs WHERE status = 'open' LIMIT 1").first();
  const results = (await env.DB.prepare("SELECT s.number, s.performer, COALESCE(SUM(v.score), 0) AS total, COUNT(v.id) AS votes FROM songs s LEFT JOIN votes v ON v.song_id = s.id WHERE s.status = 'closed' GROUP BY s.id ORDER BY total DESC, s.number ASC").all()).results;
  const next = await env.DB.prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM songs").first();
  const data = { open, results, nextNumber: next.next };
  if (includeLive) data.live = open
    ? await env.DB.prepare("SELECT COALESCE(SUM(score), 0) AS total, COUNT(*) AS votes FROM votes WHERE song_id = ?").bind(open.id).first()
    : { total: 0, votes: 0 };
  return data;
}
async function login(request, env, password) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const addressHash = await hmac(address, env.VOTE_SECRET);
  const now = Date.now();
  const attempt = await env.DB.prepare("SELECT count, last_attempt FROM login_attempts WHERE address_hash = ?").bind(addressHash).first();
  if (attempt && attempt.count >= 5 && now - attempt.last_attempt < 900000) return fail("Too many attempts. Try again in 15 minutes.", 429);
  const expected = await hmac(env.ADMIN_PASSWORD, env.SESSION_SECRET);
  const actual = await hmac(String(password ?? ""), env.SESSION_SECRET);
  if (!equal(expected, actual)) {
    await env.DB.prepare("INSERT INTO login_attempts(address_hash, count, last_attempt) VALUES(?, 1, ?) ON CONFLICT(address_hash) DO UPDATE SET count = CASE WHEN excluded.last_attempt - login_attempts.last_attempt > 900000 THEN 1 ELSE login_attempts.count + 1 END, last_attempt = excluded.last_attempt").bind(addressHash, now).run();
    return fail("Incorrect password.", 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE address_hash = ?").bind(addressHash).run();
  return json({ ok: true }, 200, { "Set-Cookie": await makeCookie(env) });
}
async function start(env, performer) {
  if (typeof performer !== "string" || !performer.trim() || performer.trim().length > 80) return fail("Enter a performer name (up to 80 characters).");
  try {
    const result = await env.DB.prepare("INSERT INTO songs(number, performer) SELECT (SELECT COALESCE(MAX(number), 0) + 1 FROM songs), ? WHERE NOT EXISTS (SELECT 1 FROM songs WHERE status = 'open')").bind(performer.trim()).run();
    if (!result.meta.changes) return fail("Close the current song before starting the next one.", 409);
    return json(await state(env, true));
  } catch (error) {
    if (String(error).includes("UNIQUE")) return fail("Close the current song before starting the next one.", 409);
    throw error;
  }
}
async function close(env, songId) {
  if (!Number.isInteger(songId)) return fail("Invalid song.");
  const result = await env.DB.prepare("UPDATE songs SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'").bind(songId).run();
  if (!result.meta.changes) return fail("This song is already closed or no longer current.", 409);
  return json(await state(env, true));
}
async function vote(env, data) {
  const songId = Number(data.songId), score = data.score, deviceId = data.deviceId;
  if (!Number.isInteger(songId) || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 20 || typeof deviceId !== "string" || !/^[a-f0-9-]{36}$/.test(deviceId)) return fail("Enter a whole-number score from 0 to 20.");
  const deviceHash = await hmac(deviceId, env.VOTE_SECRET);
  const result = await env.DB.prepare("INSERT INTO votes(song_id, device_hash, score) SELECT id, ?, ? FROM songs WHERE id = ? AND status = 'open' ON CONFLICT(song_id, device_hash) DO NOTHING").bind(deviceHash, score, songId).run();
  if (result.meta.changes) return json({ ok: true });
  const song = await env.DB.prepare("SELECT status FROM songs WHERE id = ?").bind(songId).first();
  return song?.status === "open" ? fail("This device has already voted for this song.", 409) : fail("Voting for this song has closed. Refresh for the current song.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    try {
      if (path === "/health") return json({ ok: true });
      if (path.startsWith("/api/public/")) {
        const headers = cors(request, env);
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
        if (request.method === "GET" && path === "/api/public/state") return json(await state(env), 200, headers);
        if (request.method === "POST" && path === "/api/public/vote") {
          const response = await vote(env, await readBody(request));
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
          return response;
        }
      }
      if (request.method === "GET" && path === "/api/admin/session") return json({ authenticated: await isAdmin(request, env) });
      if (request.method === "GET" && path === "/api/admin/state") return await isAdmin(request, env) ? json(await state(env, true)) : fail("Sign in required.", 401);
      if (request.method === "POST" && path.startsWith("/api/admin/")) {
        if (request.headers.get("Origin") !== url.origin) return fail("Invalid origin.", 403);
        const data = await readBody(request);
        if (path === "/api/admin/login") return login(request, env, data.password);
        if (path === "/api/admin/logout") return json({ ok: true }, 200, { "Set-Cookie": "poll_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });
        if (!await isAdmin(request, env)) return fail("Sign in required.", 401);
        if (path === "/api/admin/start") return start(env, data.performer);
        if (path === "/api/admin/close") return close(env, Number(data.songId));
      }
      if (request.method === "GET" && !path.startsWith("/api/")) return env.ASSETS.fetch(request);
      return fail("Not found.", 404);
    } catch (error) {
      console.error("Request failed:", error);
      return fail(error?.status ? error.message : "The poll is temporarily unavailable.", error?.status || 500);
    }
  }
};
