# Joy for Books operations

This is the Joy for Books operations app (titles, inventory, school requests, visits, intake).

## Copy env values

Copy `.env.example` to `.env.local`. Fill in the Convex and Clerk values.

## Install dependencies

```
npm install
```

## Run the app

Start Convex in one terminal.

```
npx convex dev
```

Start the Next.js app in another terminal.

```
npm run dev
```

## Run checks

```
npm test
npm run typecheck
npm run lint
```

## Import Notion data

Notion import is shaped JSON plus a counts CSV. It does not call the Notion API.

Build `{ "rows": [...] }` from a local J4B Data Hub dump, then dry-run.

```
npx tsx scripts/export-notion.ts --dump dump.json --out notion.json
npx tsx scripts/import-notion.ts --export notion.json --counts counts.csv
```

## Cut over to production

Staff pages need a Clerk session. Seed each trusted identity with `staff:seedStaff` as shown in the [launch and maintenance guide](docs/operations/launch-and-maintenance.md). Public requests stay paused until staff open them there.
