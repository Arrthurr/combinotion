# Home and auth boundary

The home page points schools at the public form and staff at the workspace. Anonymous visitors must not see staff navigation or staff headings.

## Sub-features

- `home-copy` shows the Joy for Books pitch and both entry links.
- `home-to-request` reaches `/request-books` from the school link.
- `anon-staff` hides staff catalog, visits, requests, reports, and staff navigation.

## How to get to it (user POV)

- Open `/`.
- Open `/books`, `/books/new`, `/visits`, `/requests`, `/reports`, `/reviews` while signed out.

## Driving it with Playwright

Preconditions:

- Isolated verification server. No Clerk session.

- **Home.** Go to `/`. Expect heading `Books that reach young readers.` Expect links `Request books for your school` and `Staff workspace`.
- **School link.** Click `Request books for your school`. Expect heading `Request books`.
- **Catalog hidden.** Go to `/books`. Heading `Book catalog` count is 0. Navigation `Staff navigation` count is 0.
- **Title workspace hidden.** Go to `/books/new`. Heading `Title workspace` count is 0.
- **Visits hidden.** Go to `/visits`. Heading `School visits` count is 0.
- **Requests hidden.** Go to `/requests`. Heading `School requests` count is 0.
- **Reports hidden.** Go to `/reports`. Heading `Book popularity` (exact) count is 0.
- **Proof.** Screenshot home and one staff URL that stayed private.

## Gotchas

- Unconfigured staff pages can still render labelled fallbacks (see staff-visits) when Clerk keys are empty. The auth-boundary check is the staff heading and `Staff navigation`, not whether a form shell exists.
- A signed-in staff session invalidates this feature. Use a fresh browser context.
