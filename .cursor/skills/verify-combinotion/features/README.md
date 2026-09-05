# combinotion verification map

Maintained source for verifying Joy for Books operations (combinotion) as a user sees it. Read this index, then the matching feature file.

## Baseline preconditions

- Prefer an isolated Next.js on `http://127.0.0.1:3101` with `NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1` and empty Clerk keys.
- Do not attach to a leftover process on port 3000. Cloud Agent `environment.json` may already own 3000 via `npm run dev` without E2E flags.
- Run the skill Doctor section first.
- Staff features require a Clerk session and a seeded staff identity. Skip them unless that session was created for this run.
- Never open public requests in production Operations settings from a verification run.

## Driving conventions

- Start from `/` or the feature URL in the file.
- Use ARIA roles and accessible names from `e2e/` and this map.
- Treat every quoted name as literal.
- Drive with the skill helper (`drive.mjs`) or Playwright (`page.getByRole` / `getByLabel`).

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Playwright` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

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
- [Staff operations views](./staff-views.md)
