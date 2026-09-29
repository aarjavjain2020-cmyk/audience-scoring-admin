import { env } from "cloudflare:workers";

const encoder = new TextEncoder();
const cookieName = "poll_admin";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function secret(name: "ADMIN_PASSWORD" | "SESSION_SECRET" | "VOTE_SECRET"): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function voteHash(deviceId: string): Promise<string> {
  if (!/^[a-f0-9-]{36}$/.test(deviceId)) throw new Error("Invalid device identifier.");
  return hmac(deviceId, secret("VOTE_SECRET"));
}

export async function passwordMatches(input: string): Promise<boolean> {
  const expected = await hmac(secret("ADMIN_PASSWORD"), secret("SESSION_SECRET"));
  const actual = await hmac(input, secret("SESSION_SECRET"));
  let different = 0;
  for (let index = 0; index < expected.length; index++) different |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return different === 0;
}

export async function sessionCookie(request: Request): Promise<string> {
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const value = `${expires}.${crypto.randomUUID()}`;
  const signature = await hmac(value, secret("SESSION_SECRET"));
  const secure = new URL(request.url).protocol === "https:" ? "Secure; " : "";
  return `${cookieName}=${value}.${signature}; HttpOnly; ${secure}SameSite=Strict; Path=/; Max-Age=28800`;
}

export async function isAdmin(request: Request): Promise<boolean> {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!cookie) return false;
  const match = /^(\d+)\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(cookie);
  if (!match || Number(match[1]) < Date.now()) return false;
  const expected = await hmac(`${match[1]}.${match[2]}`, secret("SESSION_SECRET"));
  let different = 0;
  for (let index = 0; index < expected.length; index++) different |= expected.charCodeAt(index) ^ match[3].charCodeAt(index);
  return different === 0;
}

export function clearSessionCookie(): string {
  return `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function addressHash(request: Request): Promise<string> {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  return hmac(address, secret("VOTE_SECRET"));
}
