import { createHmac, timingSafeEqual } from "node:crypto";
import { fail } from "./respond";

const COOKIE_NAME = "sq_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  const value = Netlify.env.get("SESSION_SECRET");
  if (!value) {
    throw new Error("SESSION_SECRET is not set on this Netlify project.");
  }
  return value;
}

function appPassword(): string {
  const value = Netlify.env.get("APP_PASSWORD");
  if (!value) {
    throw new Error("APP_PASSWORD is not set on this Netlify project.");
  }
  return value;
}

/** True when both env vars are present — lets the UI show a useful setup error. */
export function isConfigured(): boolean {
  return Boolean(Netlify.env.get("SESSION_SECRET") && Netlify.env.get("APP_PASSWORD"));
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** Length-safe constant-time comparison of two UTF-8 strings. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing doesn't advertise the length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: string): boolean {
  return safeEqual(candidate ?? "", appPassword());
}

/** Token is `<expiryMillis>.<hmac>` — nothing secret lives in the cookie. */
export function createSessionToken(): string {
  const expiry = String(Date.now() + MAX_AGE_SECONDS * 1000);
  return `${expiry}.${sign(expiry)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sign(payload))) return false;

  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function isAuthenticated(req: Request): boolean {
  return verifySessionToken(readCookie(req, COOKIE_NAME));
}

/**
 * Guard for every data endpoint. Returns a 401 Response to return early with,
 * or `null` when the caller may proceed.
 */
export function requireAuth(req: Request): Response | null {
  if (isAuthenticated(req)) return null;
  return fail(401, "Not signed in.");
}

export { COOKIE_NAME };
