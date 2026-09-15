# Staff reports and reviews

Staff review book popularity and moderate reviews. Anonymous users must not see those pages. Unconfigured fallbacks keep labelled controls disabled.

## Sub-features

- `reports-private` hides `Book popularity` and staff navigation when signed out with Clerk configured (redirect, not the helper).
- `reports-unconfigured` shows `Book popularity report` with disabled filter and CSV export, and no `Staff navigation`.
- `reviews-unconfigured` shows `Review moderation` with disabled `Approve review`, and no `Staff navigation`.

## How to get to it (user POV)

- Open `/reports` and `/reviews`.
- From staff navigation after sign-in (`Reports`, `Reviews`).

## Driving it with Playwright

Preconditions:

- Isolated server. The helper proves E2E unconfigured fallbacks, not a Clerk-on sign-in redirect.
- E2E unconfigured fallbacks need empty `NEXT_PUBLIC_CONVEX_URL`. If Convex URL is set, the disabled `Approve review` / filter / CSV controls are replaced by the live widgets.

- **E2E unconfigured.** `/reports` heading `Book popularity` exact count is 0. Navigation `Staff navigation` count is 0. Heading `Book popularity report` visible. Searchbox `Filter by title or author` disabled. Button `Export visible rows as CSV` disabled. `/reviews` heading `Book reviews` exact count is 0. Navigation `Staff navigation` count is 0. Heading `Review moderation` visible. Button `Approve review` disabled.
- **Signed out / Clerk on (not the helper).** Middleware redirects to `/sign-in`. Heading `Book popularity` exact count is 0. Heading `Book reviews` exact count is 0. Do not expect the unconfigured fallbacks.
- **Proof.** Screenshot both fallbacks. Helper: `node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature staff-reports`.

## Gotchas

- Exact vs long heading names differ (`Book popularity` vs `Book popularity report`, `Book reviews` vs `Review moderation`). Use the name the spec uses for that mode.
- Do not approve a real review on shared data.
