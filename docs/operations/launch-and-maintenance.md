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

Notion is a read-only archive after cutover. Nothing writes back.

1. Export the people, schools, titles, requests, visits, and reviews you still need. Map the J4B Data Hub dump with `npx tsx scripts/export-notion.ts --dump dump.json --out notion.json`. Keep the file as `{ "rows": [ ... ] }` using the import kinds in `lib/domain/notionImport.ts`. Omitted schools lack any city/state, visit street, or request city; omitted visits lack a resolvable title.
2. Export the launch-day physical count as a CSV with `isbn,quantity` columns.
3. Dry-run first.

```
npx tsx scripts/import-notion.ts --export notion.json --counts counts.csv
```

The script prints invalid rows and a preview digest. It writes nothing to Convex.

4. Apply the same files only after the dry-run is clean.

```
npx tsx scripts/import-notion.ts --export notion.json --counts counts.csv --apply
```

Apply pins to that digest. If you edit the files, run dry-run again. Replay is safe. Source ids are kept, so a second apply will not add a second opening balance or a second historical visit.

5. Historical visits are read-only and do not move stock. Opening balances come from the physical count only, one keep-first movement per title.

## Reconcile, then open requests

Walk every title against the physical count. Check Incoming forms, stale active requests, and reservation exceptions.

When the counts match, open public requests in Operations settings. Until then the public page lists no titles and submissions return a closed error.

## Routine work

- Pending intake and failed sheet polls belong on Incoming forms and Settings. Do not wait for an engineer to notice a 403.
- Reservation shortages stay visible until you release or fulfill the affected request.
- Operational records are kept. Do not paste service-account JSON or raw form dumps into chat, tickets, or recap emails.
