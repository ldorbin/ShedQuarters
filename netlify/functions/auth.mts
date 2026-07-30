import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import {
  checkPassword,
  clearedCookie,
  createSessionToken,
  isAuthenticated,
  isConfigured,
  sessionCookie,
} from "./_lib/auth";
import { fail, json, serverError } from "./_lib/respond";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes
const WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  first: number;
  lockedUntil: number;
}

/**
 * Per-IP login throttling backed by Netlify Blobs, so the limit holds across
 * serverless instances rather than only within one warm container.
 * Blob failures are swallowed — a storage outage must not lock everyone out.
 */
async function readAttempts(key: string): Promise<AttemptRecord | null> {
  try {
    const store = getStore("login-attempts");
    return (await store.get(key, { type: "json" })) as AttemptRecord | null;
  } catch {
    return null;
  }
}

async function writeAttempts(key: string, record: AttemptRecord | null): Promise<void> {
  try {
    const store = getStore("login-attempts");
    if (record) await store.setJSON(key, record);
    else await store.delete(key);
  } catch {
    // Ignore — throttling is best-effort.
  }
}

function clientKey(req: Request, context: Context): string {
  const ip =
    context.ip ||
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return ip.replace(/[^a-zA-Z0-9.:_-]/g, "_");
}

export default async (req: Request, context: Context): Promise<Response> => {
  try {
    if (!isConfigured()) {
      return fail(
        503,
        "This site isn't configured yet: APP_PASSWORD and SESSION_SECRET need setting in Netlify.",
      );
    }

    if (req.method === "GET") {
      return json({ authenticated: isAuthenticated(req) });
    }

    if (req.method === "DELETE") {
      return json({ authenticated: false }, { headers: { "set-cookie": clearedCookie() } });
    }

    if (req.method !== "POST") {
      return fail(405, "Method not allowed.");
    }

    const key = clientKey(req, context);
    const now = Date.now();
    const record = await readAttempts(key);

    if (record && record.lockedUntil > now) {
      const minutes = Math.max(1, Math.ceil((record.lockedUntil - now) / 60000));
      return fail(429, `Too many failed attempts. Try again in ${minutes} minute(s).`);
    }

    let password = "";
    try {
      const body = (await req.json()) as { password?: unknown };
      password = typeof body?.password === "string" ? body.password : "";
    } catch {
      return fail(400, "Expected a JSON body with a password.");
    }

    if (!checkPassword(password)) {
      const withinWindow = record && now - record.first < WINDOW_MS;
      const count = withinWindow ? record.count + 1 : 1;
      await writeAttempts(key, {
        count,
        first: withinWindow ? record.first : now,
        lockedUntil: count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0,
      });
      return fail(401, "Incorrect password.");
    }

    await writeAttempts(key, null);
    return json(
      { authenticated: true },
      { headers: { "set-cookie": sessionCookie(createSessionToken()) } },
    );
  } catch (error) {
    return serverError(error);
  }
};

export const config: Config = {
  path: "/api/auth",
};
