# Staff operations views

Staff review the catalog table, visit board, and operations timeline at `/views`. Anonymous users must not see the signed-in page heading. With Clerk emptied, the unconfigured fallbacks keep the three view headings visible.

## Sub-features

- `views-private` hides `Operations views` and staff navigation when signed out with Clerk configured.
- `views-unconfigured` shows heading `Staff authentication is not configured` plus headings `Table`, `Visit board`, and `Timeline`.

## How to get to it (user POV)

- Open `/views`.
- From staff navigation after sign-in (`Views`).

## Driving it with Playwright

Preconditions:

- Isolated server. Say which mode: Clerk-on vs E2E unconfigured.

- **Signed out / Clerk on.** Go to `/views`. Heading `Operations views` count is 0. Navigation `Staff navigation` count is 0.
- **E2E unconfigured.** Go to `/views`. Expect heading `Staff authentication is not configured`. Expect headings `Table`, `Visit board`, and `Timeline`.
- **Signed-in proof (skip unless seeded).** Heading `Operations views` is visible. Do not mutate table columns or visit stages on shared data.
- **Proof.** Screenshot the hidden or fallback state you actually ran. Helper: `node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature staff-views`.

## Gotchas

- Unconfigured mode replaces the staff layout, so `Operations views` stays at count 0 even while `Table`, `Visit board`, and `Timeline` are visible.
- Do not treat the public request form as proof of views.
