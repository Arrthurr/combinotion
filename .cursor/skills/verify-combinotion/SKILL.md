---
name: verify-combinotion
description: Drive the Joy for Books operations app (combinotion) the way a user does via Playwright. Use when proving a combinotion UI change, checking /request-books, or verifying staff routes stay private.
---

# Verify combinotion

Joy for Books operations app (`package.json` name `joy-for-books-operations`). Next.js 15 web UI, Convex backend, Clerk auth. Live host is a custom domain; Clerk will not work on a raw `*.vercel.app` host.

Primary surface is the web UI. Public paths are `/` and `/request-books`. Staff workspace paths are `/books`, `/books/new`, `/books/[titleId]`, `/inventory`, `/orders`, `/requests`, `/visits`, `/views`, `/people`, `/schools`, `/reviews`, `/intake`, `/reports`, `/settings`. Those staff routes need a Clerk session plus a Convex `staff:seedStaff` identity. Do not drive a signed-in browser session you did not create. Do not read `.env.local` into chat.

Work from the repository root (the directory that contains `package.json` and `playwright.config.ts`). Do not `cd` to a hardcoded personal path.

## Launch

Two modes. Default to an isolated E2E server. Never attach to a leftover listener you did not start.

**E2E / unconfigured (default for proof).** Isolated Next.js with Clerk keys cleared so public request fields render without Convex. This matches `playwright.config.ts`.

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1 npm run dev -- --hostname 127.0.0.1 --port 3101
```

Ready when `http://127.0.0.1:3101/request-books` returns HTML containing `<h1>Request books</h1>` and the label `School name`. Use port 3101 so a leftover process on 3000 is not stolen. Cloud Agent environments may already run `npm run dev` on 3000 without the E2E flags; leave that process alone.

Teardown: kill only the PID you started. Never kill by process name.

**Full local stack (staff features).** Only when you must prove a signed-in path.

```
npx convex dev
npm run dev
```

Needs `.env.local`. Staff pages need a Clerk session. Seed with `npx convex run staff:seedStaff` as in `docs/operations/launch-and-maintenance.md`. Public requests stay held until staff open them in Operations settings.

## Doctor

Read-only. Run before driving.

1. `curl -sS -o /tmp/combinotion-doctor.html -w "%{http_code}" http://127.0.0.1:3101/request-books` is `200` (use port 3000 only if you launched the full stack yourself).
2. That HTML includes `<h1>Request books</h1>`. For E2E mode it also includes `School name`. A hold-only page (`Public book requests are closed` and no school-name field) is a live Convex hold, not the E2E form.
3. Confirm the listener is the PID you started: `lsof -iTCP:3101 -sTCP:LISTEN` (or `ss -ltnp | grep 3101`). Do not drive someone else's 3000.
4. For E2E mode, `NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1` must be on that process (`tr '\0' '\n' < /proc/<pid>/environ | grep NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS`). If Clerk keys are set and Convex is missing, the public form may show a hold instead of fields.

If doctor fails, stop. Do not drive a shared instance you did not start.

## Drive

Harness is Playwright already in this repo (`e2e/`) plus the skill helper that talks to an existing server. Prefer ARIA roles and labels. Do not use click coordinates.

Install browsers once if needed: `npx playwright install`.

Preferred one-off drive against the isolated 3101 server (does not start a second Next process):

```
node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature public-request
```

`--feature` values: `public-request`, `home-and-auth-boundary`, `staff-visits`, `staff-reports`, `staff-catalog`, `staff-views`.

Repo Playwright specs (`npx playwright test e2e/public-request.spec.ts --config=playwright.config.ts`) start their own Next server on port 3000 with Clerk keys emptied and `NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1`. `reuseExistingServer` is false. Do not run that config while port 3000 is already in use. Prefer the 3101 server plus `drive.mjs` when 3000 is busy.

Stable handles (from `e2e/` and the pages they cover):

- Home: heading `Books that reach young readers.`; link `Request books for your school`; link `Staff workspace`
- Public request: heading `Request books`; heading `Available titles`; labels `School name`, `School address`, `Contact name`, `Email`, `Title ISBN`, `Copies`; button `Reserve requested copies`; status role for hold/success
- Staff page headings (signed-in layout only): `Book catalog`, `Add a title`, `Title workspace`, `Inventory`, `Supplier orders`, `School requests`, `School visits`, `Operations views`, `People`, `Schools`, `Book reviews`, `Incoming forms`, `Book popularity`, `Operations settings`; navigation `Staff navigation`
- Unconfigured staff shell (Clerk publishable key empty): heading `Staff authentication is not configured`. Path fallbacks: `/visits` labels `School`, `Occurred at`, `Staff present`, `Readers`, group `Books`, label `Follow-up`, status `Connect Convex to save visits.`; `/reports` heading `Book popularity report` with disabled searchbox `Filter by title or author` and button `Export visible rows as CSV`; `/reviews` heading `Review moderation` with disabled button `Approve review`; `/views` headings `Table`, `Visit board`, `Timeline`
- Auth boundary: anonymous `/books`, `/books/new`, `/visits`, `/requests`, `/reports`, `/reviews`, `/views` must NOT show the matching staff page heading or `Staff navigation`

POST `/api/school-requests` is the real public submit path. E2E may mock it. A live submit against production Convex is not a first-run proof. Public requests are held in production until staff open them.

## Evidence

Put proof in `.cursor/skills/verify-combinotion/artifacts/<feature-id>/`. Keep artifacts after cleanup.

- Screenshot of the driven page with the heading visible (`form.png` or the name the feature file gives)
- Accessibility snapshot (`aria.txt`) or Playwright trace
- For a submit: the status text and, if mocked, the mocked reference (example `JFB-TEST1234`)
- For auth boundary: proof the staff heading count is 0

Proof standards: exercise the real user path (`/`, `/request-books`, staff URLs). Do not call Convex mutations from the skill as a substitute for the form. Capture the action and the resulting state. Side effects: a real reserve changes Convex inventory; do not do that on the first proof. Use the E2E unconfigured form or a mocked `/api/school-requests`. When a dry-run or mock is used, confirm the live POST was not sent (helper route intercept, or no new Convex request row).

## Cleanup

Kill only the Next.js PID you started on 3101 (or the Playwright `webServer` child if you used the default config). Leave `.env.local`, Convex, and any 3000 server you did not start. Keep `artifacts/`.

## Helpers

```
node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature public-request
```

The helper launches Chromium against an already-running base URL, drives one mapped feature, writes screenshots and `proof.txt` under `artifacts/<feature-id>/`, and exits non-zero on failure. It does not start or stop Next.js.

Repo Playwright remains valid when port 3000 is free:

```
npx playwright test e2e/public-request.spec.ts
```

Feature map: `.cursor/skills/verify-combinotion/features/`.
