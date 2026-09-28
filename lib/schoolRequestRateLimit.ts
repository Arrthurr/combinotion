export const SCHOOL_REQUEST_RATE_MAX_ATTEMPTS = 5;
export const SCHOOL_REQUEST_RATE_WINDOW_MS = 10 * 60 * 1000;
export const SCHOOL_REQUEST_RATE_LIMIT_MESSAGE =
  "Please wait a few minutes before submitting another request.";

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

export function schoolRequestRateLimitKeyFromEmail(email: string) {
  return `email:${email.trim().toLowerCase()}`;
}

export function recentSchoolRequestAttempts(
  attempts: number[],
  now: number,
) {
  const windowStart = now - SCHOOL_REQUEST_RATE_WINDOW_MS;
  return attempts.filter((timestamp) => timestamp > windowStart);
}

export function schoolRequestRetryAfterSeconds(
  oldestAttemptAt: number,
  now: number,
) {
  return Math.max(
    1,
    Math.ceil(
      (oldestAttemptAt + SCHOOL_REQUEST_RATE_WINDOW_MS - now) / 1000,
    ),
  );
}

export function consumeSchoolRequestAttempt(
  clientKey: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const recent = recentSchoolRequestAttempts(
    attemptsByClient.get(clientKey) ?? [],
    now,
  );
  if (recent.length >= SCHOOL_REQUEST_RATE_MAX_ATTEMPTS) {
    attemptsByClient.set(clientKey, recent);
    return {
      allowed: false,
      retryAfterSeconds: schoolRequestRetryAfterSeconds(recent[0]!, now),
    };
  }
  recent.push(now);
  attemptsByClient.set(clientKey, recent);
  return { allowed: true };
}
