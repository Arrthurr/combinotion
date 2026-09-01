# Staff catalog

Staff manage donation titles at `/books`. Anonymous users must not see the catalog or a title workspace.

## Sub-features

- `catalog-private` hides `Book catalog` and staff navigation.
- `title-new-private` hides `Title workspace` at `/books/new`.

## How to get to it (user POV)

- Open `/books` or `/books/new`.
- From home, `Staff workspace` (signed in).

## Driving it with Playwright

Preconditions:

- Isolated server. No staff session unless you are proving the signed-in path on a disposable identity.

- **Anonymous catalog.** Go to `/books`. Heading `Book catalog` count is 0. Navigation `Staff navigation` count is 0.
- **Anonymous new title.** Go to `/books/new`. Heading `Title workspace` count is 0.
- **Signed-in proof (skip unless seeded).** Heading `Book catalog` visible. Do not create a title on shared Convex.
- **Proof.** Screenshot the hidden or visible state you actually ran.

## Gotchas

- Public requests do not prove the catalog. If you only drove `/request-books`, this feature is skipped, not verified.
- Opening public requests in Operations settings is a production cutover step, not a verification action.
