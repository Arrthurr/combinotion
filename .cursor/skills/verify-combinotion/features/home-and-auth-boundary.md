# Home and auth boundary

The home page points schools at the public form and staff at the workspace. Anonymous visitors must not see staff navigation or staff page headings.

## Sub-features

- `home-copy` shows the Joy for Books pitch and both entry links.
- `home-to-request` reaches `/request-books` from the school link.
- `anon-staff` hides staff catalog, visits, requests, reports, reviews, views, and staff navigation.

## How to get to it (user POV)

- Open `/`.
- Open `/books`, `/books/new`, `/visits`, `/requests`, `/reports`, `/reviews`, `/views` while signed out.
- Optional spot-check: `/inventory`, `/orders`, `/people`, `/schools`, `/intake`, `/settings`.

## Driving it with Playwright

Preconditions:

- Isolated verification server. No Clerk session.

- **Home.** Go to `/`. Expect heading `Books that reach young readers.`. Expect links `Request books for your school` and `Staff workspace`.
- **School link.** Click `Request books for your school`. Expect heading `Request books`.
- **Catalog hidden.** Go to `/books`. Heading `Book catalog` count is 0. Navigation `Staff navigation` count is 0.
- **New title hidden.** Go to `/books/new`. Heading `Add a title` count is 0. Heading `Title workspace` count is 0.
- **Visits hidden.** Go to `/visits`. Heading `School visits` count is 0.
- **Requests hidden.** Go to `/requests`. Heading `School requests` count is 0.
- **Reports hidden.** Go to `/reports`. Heading `Book popularity` (exact) count is 0.
- **Reviews hidden.** Go to `/reviews`. Heading `Book reviews` (exact) count is 0.
- **Views hidden.** Go to `/views`. Heading `Operations views` count is 0.
- **Proof.** Screenshot home and one staff URL that stayed private. Helper: `node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature home-and-auth-boundary`.

## Gotchas

- Unconfigured staff pages can still render labelled fallbacks (visits, reports, reviews, views) when Clerk keys are empty. The auth-boundary check is the staff page heading (`School visits`, `Book popularity` exact, `Book reviews` exact, `Operations views`) and `Staff navigation`, not whether a form shell exists.
- A signed-in staff session invalidates this feature. Use a fresh browser context.
- `/books/new` signed-in heading is `Add a title`. `Title workspace` is the `/books/[titleId]` heading.
