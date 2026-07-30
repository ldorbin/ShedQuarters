const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(BASE_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, { status });
}

/** Turns a thrown value into a 500 without leaking internals to the browser. */
export function serverError(error: unknown): Response {
  console.error("[api]", error);
  return fail(500, "Something went wrong handling that request.");
}
