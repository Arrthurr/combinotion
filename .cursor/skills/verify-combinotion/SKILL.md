---
name: verify-combinotion
description: Drive the Joy for Books operations app (combinotion) the way a user does via Playwright. Use when proving a combinotion UI change, checking /request-books, or verifying staff routes stay private.
---

# Verify combinotion

Joy for Books operations app. Next.js 15 on port 3000, Convex backend, Clerk auth. Live site is https://combinotion.vercel.app (Clerk will not work on a raw *.vercel.app host). Local checkout: Developer/combinotion. Repo: Arrthurr/combinotion.

Primary surface is the web UI. Public path is `/` and `/request-books`. Staff workspace is under `/books`, `/inventory`, `/visits`, `/requests`, `/schools`, `/people`, `/orders`, `/intake`, `/reviews`, `/reports`, `/views`, `/settings`. Those staff routes need a Clerk session plus a Convex staff:seedStaff identity. Do not drive a signed-in browser session you did not create. Do not read `.env.local` into chat.

## Launch

Two modes.

**E2E / unconfigured (default for proof).** Isolated Next.js with Clerk keys cleared so public request fields render without Convex. This is what `playwright.config.ts` already does.

```
cd /Users/arthurturnbull/Developer/combinotion
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1 npm run dev -- --port 3101
```

Ready when `http://127.0.0.1:3101/request-books` returns the heading `Request books`. Use port 3101 so a leftover process on 3000 is not stolen.

Teardown: kill only the PID you started. Never kill by process name.

**Full local stack (staff features).** Only when you must prove a signed-in path.

```
npx convex dev
npm run dev
```

Needs `.env.local` (already present). Staff pages need a Clerk session. Seed with `npx convex run staff:seedStaff` as in `docs/operations/launch-and-maintenance.md`. Public requests stay held until staff open them in Operations settings.

## Doctor

Read-only. Run before driving.

1. `curl -sI http://127.0.0.1:3101/request-books` (or 3000 if you launched full stack) is HTTP 200.
2. The HTML includes `<h1>Request books</h1>` or the home heading `Books that reach young readers.`
3. Confirm the listener is the PID you started (`lsof -iTCP:3101 -sTCP:LISTEN`), not someone else's 3000.
4. For E2E mode, `NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1` must be on that process. If Clerk keys are set and Convex is missing, the public form may show a hold instead of fields.

If doctor fails, stop. Do not drive a shared instance you did not start.

## Drive

Harness is Playwright already in this repo (`e2e/`). Prefer ARIA roles and labels from those specs. Do not use click coordinates.

Install browsers once if needed: `npx playwright install`.

One-off drive:

```
cd /Users/arthurturnbull/Developer/combinotion
npx playwright test e2e/public-request.spec.ts e2e/navigation.spec.ts --config=playwright.config.ts
```

`playwright.config.ts` starts the Next server on port 3000 with Clerk keys emptied and `NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1`. `reuseExistingServer` is false. Do not run that config while port 3000 is already in use. Prefer the 3101 server when 3000 is busy.

Stable handles (from `e2e/`):

- Home: heading `Books that reach young readers.`; link `Request books for your school`; link `Staff workspace`
- Public request: heading `Request books`; labels `School name`, `School address`, `Contact name`, `Email`, `Title ISBN`, `Copies`; button `Reserve requested copies`; status role for hold/success
- Staff (only when signed in): navigation `Staff navigation`; headings `Book catalog`, `School visits`, `School requests`, `Book popularity report`, `Review moderation`
- Auth boundary: anonymous `/books`, `/visits`, `/requests`, `/reports` must NOT show those staff headings or `Staff navigation`

POST `/api/school-requests` is the real public submit path. E2E may mock it. A live submit against production Convex is not a first-run proof. Public requests are held in production until staff open them.

## Evidence

Put proof in `.cursor/skills/verify-combinotion/artifacts/<feature-id>/`. Keep artifacts after cleanup.

- Screenshot of the driven page with the heading visible
- ARIA/accessibility snapshot or Playwright trace
- For a submit: the status text and, if mocked, the mocked reference (example `JFB-TEST1234`)
- For auth boundary: proof the staff heading count is 0

Proof standards: exercise the real user path (`/`, `/request-books`, staff URLs). Do not call Convex mutations from the skill as a substitute for the form. Capture the action and the resulting state. Side effects: a real reserve changes Convex inventory; do not do that on the first proof. Use the E2E unconfigured form or a mocked `/api/school-requests`.

## Cleanup

Kill only the Next.js PID you started on 3101 (or the Playwright webServer child if you used the default config). Leave `.env.local`, Convex, and any 3000 server you did not start. Keep `artifacts/`.

## Helpers

No extra helper script. Use repo Playwright:

```
npx playwright test e2e/public-request.spec.ts
```

Feature map: `.cursor/skills/verify-combinotion/features/`.
