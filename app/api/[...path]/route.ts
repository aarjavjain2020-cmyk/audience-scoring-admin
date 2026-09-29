import { env } from "cloudflare:workers";
import { adminState, closeSong, publicState, startSong, submitVote } from "@/lib/poll";
import { addressHash, clearSessionCookie, isAdmin, passwordMatches, sessionCookie, voteHash } from "@/lib/security";

export const runtime = "edge";

function cors(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = env.AUDIENCE_ORIGIN;
  return origin && allowed && origin === allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" } : {};
}

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function failure(error: unknown, headers: HeadersInit = {}) {
  const message = error instanceof Error ? error.message : "Request failed.";
  const status = message.includes("already voted") ? 409 : message.includes("database") || message.includes("configured") ? 503 : 400;
  return json({ error: message }, status, headers);
}

async function pathOf(context: { params: Promise<{ path: string[] }> }) {
  return (await context.params).path.join("/");
}

export async function OPTIONS(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = await pathOf(context);
  if (!path.startsWith("public/")) return new Response(null, { status: 404 });
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = await pathOf(context);
  try {
    if (path === "public/state") return json(await publicState(), 200, cors(request));
    if (path === "admin/session") return json({ authenticated: await isAdmin(request) });
    if (path === "admin/state") return (await isAdmin(request)) ? json(await adminState()) : json({ error: "Sign in required." }, 401);
    return json({ error: "Not found." }, 404);
  } catch (error) { return failure(error, path.startsWith("public/") ? cors(request) : {}); }
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = await pathOf(context);
  const publicHeaders = path.startsWith("public/") ? cors(request) : {};
  try {
    const body = await request.json() as Record<string, unknown>;
    if (path === "public/vote") {
      const hash = await voteHash(String(body.deviceId ?? ""));
      return json(await submitVote(Number(body.songId), Number(body.score), hash), 200, publicHeaders);
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
    if (path === "admin/login") {
      const address = await addressHash(request);
      const now = Date.now();
      const attempt = await env.DB!.prepare("SELECT count, last_attempt FROM login_attempts WHERE address_hash = ?").bind(address).first<{ count: number; last_attempt: number }>();
      if (attempt && attempt.count >= 5 && now - attempt.last_attempt < 15 * 60 * 1000) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      if (!await passwordMatches(String(body.password ?? ""))) {
        await env.DB!.prepare("INSERT INTO login_attempts (address_hash, count, last_attempt) VALUES (?, 1, ?) ON CONFLICT(address_hash) DO UPDATE SET count = CASE WHEN ? - last_attempt > 900000 THEN 1 ELSE count + 1 END, last_attempt = ?").bind(address, now, now, now).run();
        return json({ error: "Incorrect password." }, 401);
      }
      await env.DB!.prepare("DELETE FROM login_attempts WHERE address_hash = ?").bind(address).run();
      return json({ ok: true }, 200, { "Set-Cookie": await sessionCookie(request) });
    }
    if (path === "admin/logout") return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    if (!await isAdmin(request)) return json({ error: "Sign in required." }, 401);
    if (path === "admin/start") return json(await startSong(String(body.performer ?? "").trim()));
    if (path === "admin/close") return json(await closeSong(Number(body.songId)));
    return json({ error: "Not found." }, 404);
  } catch (error) { return failure(error, publicHeaders); }
}
