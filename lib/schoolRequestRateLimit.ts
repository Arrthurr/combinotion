const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

const attemptsByClient = new Map<string, number[]>();

export function resetSchoolRequestRateLimit() {
  attemptsByClient.clear();
}

export function schoolRequestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const client = forwarded.split(",")[0]?.trim();
    if (client) {
      return client;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

export function consumeSchoolRequestAttempt(
  clientKey: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const windowStart = now - WINDOW_MS;
  const recent = (attemptsByClient.get(clientKey) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );
  if (recent.length >= MAX_ATTEMPTS) {
    attemptsByClient.set(clientKey, recent);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent[0]! + WINDOW_MS - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }
  recent.push(now);
  attemptsByClient.set(clientKey, recent);
  return { allowed: true };
}
