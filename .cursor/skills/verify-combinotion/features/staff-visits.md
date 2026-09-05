# Staff visits

Staff record school visits. Anonymous users must not see the workspace. With Clerk emptied, the unconfigured editor still shows labelled fields and a Convex connect status.

## Sub-features

- `visits-private` hides `School visits` and staff navigation when signed out with Clerk configured.
- `visits-unconfigured` shows School, Occurred at, Staff present, Readers, Books, Follow-up and status `Connect Convex to save visits.`

## How to get to it (user POV)

- Open `/visits`.
- From staff navigation after sign-in (`Visits`).

## Driving it with Playwright

Preconditions:

- Isolated server. Say which mode: Clerk-on vs E2E unconfigured.

- **Signed out / Clerk on.** Go to `/visits`. Heading `School visits` count is 0. Navigation `Staff navigation` count is 0.
- **E2E unconfigured.** Go to `/visits`. Expect heading `Staff authentication is not configured`. Expect labels `School`, `Occurred at`, `Staff present`, `Readers`, group `Books`, label `Follow-up`. Status contains `Connect Convex to save visits.`
- **Signed-in proof (skip unless this run has a seeded Clerk session).** Heading `School visits` is visible. Do not create a real visit on shared data.
- **Proof.** Screenshot and heading counts. Helper: `node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature staff-visits`.

## Gotchas

- Saving a visit moves operational data. Do not save on a shared Convex deployment from verification.
- Historical imported visits are read-only and do not move stock.
- Unconfigured mode replaces the staff layout. `School visits` stays at count 0 even though the visit editor fields are visible.
