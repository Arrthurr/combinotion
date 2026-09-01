# Staff reports and reviews

Staff review book popularity and moderate reviews. Anonymous users must not see those pages. Unconfigured fallbacks keep labelled controls disabled.

## Sub-features

- `reports-private` hides `Book popularity` and staff navigation when signed out with Clerk configured.
- `reports-unconfigured` shows `Book popularity report` with disabled filter and CSV export.
- `reviews-unconfigured` shows `Review moderation` with disabled `Approve review`.

## How to get to it (user POV)

- Open `/reports` and `/reviews`.

## Driving it with Playwright

Preconditions:

- Isolated server.

- **Signed out / Clerk on.** `/reports` heading `Book popularity` exact count is 0. `/reviews` heading `Book reviews` exact count is 0.
- **E2E unconfigured.** `/reports` heading `Book popularity report` visible. Searchbox `Filter by title or author` disabled. Button `Export visible rows as CSV` disabled. `/reviews` heading `Review moderation` visible. Button `Approve review` disabled.
- **Proof.** Screenshot both fallbacks or both hidden states.

## Gotchas

- Exact vs long heading names differ (`Book popularity` vs `Book popularity report`). Use the name the spec uses for that mode.
- Do not approve a real review on shared data.
