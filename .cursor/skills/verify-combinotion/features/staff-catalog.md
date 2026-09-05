# Staff catalog

Staff manage donation titles at `/books`. Anonymous users must not see the catalog, the add-title page, or a title workspace.

## Sub-features

- `catalog-private` hides `Book catalog` and staff navigation.
- `title-new-private` hides `Add a title` at `/books/new`.
- `title-workspace-private` hides `Title workspace` at `/books/[titleId]`.

## How to get to it (user POV)

- Open `/books` or `/books/new`.
- Open a saved title at `/books/<titleId>` (signed in).
- From home, `Staff workspace` (signed in).

## Driving it with Playwright

Preconditions:

- Isolated server. No staff session unless you are proving the signed-in path on a disposable identity.

- **Anonymous catalog.** Go to `/books`. Heading `Book catalog` count is 0. Navigation `Staff navigation` count is 0.
- **Anonymous new title.** Go to `/books/new`. Heading `Add a title` count is 0. Heading `Title workspace` count is 0.
- **Signed-in proof (skip unless seeded).** Heading `Book catalog` visible. `/books/new` heading is `Add a title`. Do not create a title on shared Convex.
- **Proof.** Screenshot the hidden or visible state you actually ran. Helper: `node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature staff-catalog`.

## Gotchas

- Public requests do not prove the catalog. If you only drove `/request-books`, this feature is skipped, not verified.
- Opening public requests in Operations settings is a production cutover step, not a verification action.
- `Title workspace` is the signed-in `/books/[titleId]` heading, not `/books/new`.
