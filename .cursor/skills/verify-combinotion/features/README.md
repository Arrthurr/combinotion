# combinotion verification map

Maintained source for verifying Joy for Books operations (combinotion) as a user sees it. Read this index, then the matching feature file.

## Baseline preconditions

- Prefer an isolated Next.js on `http://127.0.0.1:3101` with `NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1` and empty Clerk keys.
- Do not attach to a leftover process on port 3000.
- Run the skill Doctor section first.
- Staff features require a Clerk session and a seeded staff identity. Skip them unless that session was created for this run.
- Never open public requests in production Operations settings from a verification run.

## Driving conventions

- Start from `/` or the feature URL in the file.
- Use ARIA roles and accessible names from `e2e/`.
- Treat every quoted name as literal.
- Drive with Playwright (`page.getByRole` / `getByLabel`).

## Proof and skip reporting

- Capture the action and the resulting state.
- UI proof includes a screenshot with the page heading visible.
- Auth-boundary proof includes a zero count for the staff heading.
- Record the feature ID with every artifact.
- If Clerk or Convex is missing, report staff features skipped with the unmet precondition. Do not mark them verified via the public path.

## Features

- [Public school request](./public-request.md)
- [Home and auth boundary](./home-and-auth-boundary.md)
- [Staff visits](./staff-visits.md)
- [Staff reports and reviews](./staff-reports.md)
- [Staff catalog](./staff-catalog.md)
