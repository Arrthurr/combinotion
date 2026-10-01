export const SCHOOL_REQUEST_RATE_MAX_ATTEMPTS = 5;
export const SCHOOL_REQUEST_RATE_WINDOW_MS = 10 * 60 * 1000;
export const SCHOOL_REQUEST_RATE_LIMIT_MESSAGE =
  "Please wait a few minutes before submitting another request.";

export function schoolRequestRateLimitKeyFromEmail(email: string) {
  return `email:${email.trim().toLowerCase()}`;
}

export function recentSchoolRequestAttempts(attempts: number[], now: number) {
  const windowStart = now - SCHOOL_REQUEST_RATE_WINDOW_MS;
  return attempts.filter((timestamp) => timestamp > windowStart);
}

export function schoolRequestRetryAfterSeconds(
  oldestAttemptAt: number,
  now: number,
) {
  return Math.max(
    1,
    Math.ceil((oldestAttemptAt + SCHOOL_REQUEST_RATE_WINDOW_MS - now) / 1000),
  );
}
