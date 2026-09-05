# Launch and maintenance

Public requests stay closed until you open them in Operations settings. That is deliberate. Cut over inventory first, then flip the hold.

## Hosting

1. Point a custom Vercel domain at the app. Clerk will not work on the default `*.vercel.app` host.
2. Create the production Clerk instance and Convex deployment. Put the values from `.env.example` in Vercel and in the Convex dashboard.
3. Seed staff with `npx convex run staff:seedStaff '{"clerkId":"<clerk subject>","email":"<email>"}'`. Repeat for each trusted collaborator.

## Google Sheets intake

The env vars hold credentials only. Feeds do not start because a sheet id is present.

1. Create a COO-owned Google service account and download its JSON key.
2. Share each linked Form sheet with that account as Viewer. Share the exact tab you mapped, not the whole Drive folder by habit.
3. Set `GOOGLE_SERVICE_ACCOUNT_JSON` on the Convex deployment. Keep `GOOGLE_SHEET_DONATION_APPLICATIONS_ID` and `GOOGLE_SHEET_BOOK_REVIEWS_ID` as operator notes if useful. The live mapping lives in Operations settings.
4. In Settings, save the spreadsheet id, tab name, and column mapping for book reviews and donation applications.
5. Use Verify and enable. The app checks that the account can read the tab and that mapped headers exist. A missing grant or a renamed column fails in place. It does not silently disable polling later without a visible last-poll error.
6. Convex polls enabled feeds every 15 minutes. Incoming forms shows pending, invalid, and resolved rows. Unmatched rows stay until you attach them, create the missing record, or dismiss them.

Rotate the service account key when someone leaves or a sheet is unshared. Revoke the old key in Google Cloud, then replace `GOOGLE_SERVICE_ACCOUNT_JSON`. Raw form payloads are dropped after 180 days. The CRM record and the intake outcome stay.

## Notion import

Notion is a read-only archive after cutover. Nothing writes back. The app does not call the Notion API. Cursor reads Notion, writes the import files, then the local script dry-runs and applies them.

### Produce the export

1. Connect Cursor to Notion's hosted MCP (`https://mcp.notion.com/mcp`) in desktop or Cloud Agents MCP settings. Share every related people, school, title, request, visit, and review database with that connection. A related database that is not shared comes back with empty links.
2. Write the request rules before any fetch. Each historical request has one fate:
   - Omit the row. It stays in Notion only.
   - `historicalContext` with `fulfilled`, `cancelled`, or `declined`. History only. No reservations. No stock movement.
   - `verifiedActive` with `{ isbn, quantity }` lines. This becomes a live reservation and is the only import path that changes availability.
   A request with no disposition becomes fulfilled history. Do not let the agent invent `verifiedActive` lines.
3. Ask Cursor to pull the people, schools, titles, requests, visits, and reviews you still need, and to write `notion.json` as `{ "rows": [ ... ] }` using the import kinds in `lib/domain/notionImport.ts`. Use Notion page ids for `notionId`, `schoolNotionId`, `staffNotionIds`, and `readerNotionIds`. Use the printed ISBN for every title, review, visit book, and active request line. Those ISBN strings must match exactly. Put people, schools, and titles before the visits and requests that reference them. Relation lists on a page stop at 25 until you paginate the property. Prefer page ids over SQL query dumps. SQL mode can drop link targets.
4. Export the launch-day physical count yourself as `counts.csv` with `isbn,quantity` columns. That file comes from the shelf, not from Notion.

Treat the agent's `notion.json` as untrusted until the dry-run and a spot-check pass. Notion MCP returns whatever the connected account can see, including emails. Do not paste that dump into chat, tickets, or recap emails.

### Dry-run, then apply

1. Dry-run first.

```
npx tsx scripts/import-notion.ts --export notion.json --counts counts.csv
```

The script prints invalid rows and a preview digest. It writes nothing to Convex. Dry-run checks shape and duplicate source ids. It does not prove that a `schoolNotionId` or ISBN exists. A missing school or title fails at apply and rolls the whole write back. A missing reader is skipped with no warning.

2. Spot-check the digest against the export. Confirm every visit has a school and readers you recognize. Confirm every `verifiedActive` line is a request that should still reserve stock.

3. Apply the same files only after the dry-run is clean.

```
npx tsx scripts/import-notion.ts --export notion.json --counts counts.csv --apply
```

Apply pins to that digest. If you edit the files, run dry-run again. Replay is safe. Source ids are kept, so a second apply will not add a second opening balance or a second historical visit.

4. Historical visits are read-only and do not move stock. Opening balances come from the physical count only, one keep-first movement per title. If the same apply writes a `verifiedActive` reservation for a title and then an opening balance for that title, the opening balance is rejected. Put counts on after titles and before active requests, or apply counts first and active requests in a second run.

## Reconcile, then open requests

Walk every title against the physical count. Check Incoming forms, stale active requests, and reservation exceptions.

When the counts match, open public requests in Operations settings. Until then the public page lists no titles and submissions return a closed error.

## Routine work

- Pending intake and failed sheet polls belong on Incoming forms and Settings. Do not wait for an engineer to notice a 403.
- Reservation shortages stay visible until you release or fulfill the affected request.
- Operational records are kept. Do not paste service-account JSON, raw form dumps, or Notion MCP exports into chat, tickets, or recap emails.
