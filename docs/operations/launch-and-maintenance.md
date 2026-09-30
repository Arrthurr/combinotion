# Launch and maintenance

`ops.joyforbooks.org` is the staff app. `/` sends staff to sign-in (signed-in staff go to `/books`). School-visit reservations live at `/request-books`: a public, unlisted path. The origin is noindexed. Do not advertise it on Squarespace, social, or a CRM dump.

That page is **not** the classroom-shipping application on [joyforbooks.org/freebooks](https://www.joyforbooks.org/freebooks). `/freebooks` is a need-based Google Form (U8 donation-application intake). Selected educators get shipped books. Combinotion reservations are for schools the COO already visits.

**Standing rule:** whenever the `/freebooks` cycle is open, hold combinotion **Held closed** and do not email `/request-books`. Overlapping “get books” paths is the bug.

New environments still default to paused until staff open them after inventory cutover.

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
7. After a first-time poll that imported full Form history, clear the backlog with `npx convex run intake:workDownIntakeBacklog --prod`. That re-parses invalid rows (including header casing drift), accepts leftover book reviews without inventing catalog titles, and creates people (and schools when both name and city/address are present) from pending donation applications. New polls still only add unmatched new rows; failed last-poll errors stay on Settings / Incoming forms.

Backlog results include `failureDetails` with the item id, source id, and redacted error message for each failed item. The optional `limit` is a non-negative integer (default 200), bounding attempts per phase, including failures. Each item runs in a sub-transaction: failed writes roll back, successful items remain, and retries do not repeat resolved items.

Item transitions live in `convex/lib/intakeLifecycle.ts`; feed configuration and Google Sheets fetching remain separate. Recoverable headers/cells are stored in `sourcePayload`, independently of the SHA-256 comparison fingerprint. Legacy JSON fingerprints are upgraded on replay without creating duplicate records or false source drift. Edits to resolved source rows mark drift but do not rewrite their original resolution or resulting record.

Rotate the service account key when someone leaves or a sheet is unshared. Revoke the old key in Google Cloud, then replace `GOOGLE_SERVICE_ACCOUNT_JSON`. Raw form payloads are dropped after 180 days. The CRM record and the intake outcome stay.

The purge removes both `rawValues` and `sourcePayload`. Legacy invalid rows can be recovered from their old fingerprint only while their raw payload is retained. Once purged, reprocessing reports that the source payload is unavailable rather than reconstructing it from the comparison field.

## Notion import

Notion is a read-only archive after cutover. Nothing writes back. The app does not call the Notion API. Cursor reads Notion into a dump, `export-notion.ts` maps that dump to `notion.json`, then the local script dry-runs and applies it.

### Produce the export

1. Connect Cursor to Notion's hosted MCP (`https://mcp.notion.com/mcp`) in desktop or Cloud Agents MCP settings. Share every related people, school, title, request, visit, and review database with that connection. A related database that is not shared comes back with empty links.
2. Write the request rules before any fetch. Each historical request has one fate:
   - Omit the row. It stays in Notion only.
   - `historicalContext` with `fulfilled`, `cancelled`, or `declined`. History only. No reservations. No stock movement.
   - `verifiedActive` with `{ isbn, quantity }` lines. This becomes a live reservation and is the only import path that changes availability.
   A request with no disposition becomes fulfilled history. Do not let the agent invent `verifiedActive` lines. `export-notion.ts` emits `historicalContext` only. Add `verifiedActive` lines by hand after the map if a request must still reserve stock.
3. Ask Cursor to pull the people, schools, titles, requests, visits, and reviews you still need into `dump.json` as `{ people, organizations, titles, requests, reviews, visits }`. Prefer page ids over SQL query dumps. SQL mode can drop link targets. Relation lists on a page stop at 25 until you paginate the property.
4. Map the dump.

```
npx tsx scripts/export-notion.ts --dump dump.json --out notion.json
```

The mapper writes `{ "rows": [ ... ] }` using the import kinds in `lib/domain/notionImport.ts`. It uses Notion page ids for `notionId`, `schoolNotionId`, `staffNotionIds`, and `readerNotionIds`, and a digit-only ISBN for every title, review, and visit book. Hyphens and spaces are stripped so a second import cannot create a duplicate title. Author and catalog copy drop Notion markdown links. People, schools, and titles come before the visits and requests that reference them. Omitted schools lack any city/state, visit street, or request city. Omitted visits lack a resolvable title.
5. Export the launch-day physical count yourself as `counts.csv` with `isbn,quantity` columns. That file comes from the shelf, not from Notion.

Treat the mapped `notion.json` as untrusted until the dry-run and a spot-check pass. Notion MCP returns whatever the connected account can see, including emails. Do not paste that dump into chat, tickets, or recap emails.

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

Apply pins to that digest. If you edit the files, run dry-run again. Replay is safe. Source ids are kept, so a second apply will not add a second opening balance or a second historical visit. Title matching uses the digit-only ISBN, so a hyphenated reprint of an already-imported title is reused instead of inserted twice.

If live titles still show markdown authors or mixed ISBN punctuation, rewrite them in place with `npx convex run migrations/rewriteCatalog:rewriteCatalog --prod`. That command refuses to run when two titles would collapse onto the same ISBN.

4. Historical visits are read-only and do not move stock. Opening balances come from the physical count only, one keep-first movement per title. If the same apply writes a `verifiedActive` reservation for a title and then an opening balance for that title, the opening balance is rejected. Put counts on after titles and before active requests, or apply counts first and active requests in a second run.

## Public requests (open / hold)

`/request-books` is reached from a COO-picked email, not from Squarespace. Squarespace stays on fundraising checkout and on `/freebooks`. Do not add a combinotion CTA there.

To change the reservation gate:

1. Sign in as staff and open **Settings**.
2. Under **Operating controls → Public book requests**, choose **Open** or **Held closed**.
3. When holding closed, set an optional **Hold message** (default copy is “Public book requests are closed”).
4. Save operating controls.

While held closed, `/request-books` lists no titles and school submissions return HTTP 503 with the hold message. While open, the page lists every title with available-to-request quantity greater than zero.

### This freeze (2026-09-29, while `/freebooks` is still open)

1. **Held closed** now. Hold message (one-off, not the code default): **School visit reservations are paused.**
2. After 2026-09-30, **in this order:** close `/freebooks` on Squarespace (copy = cycle closed; Form CTA off or “applications closed”) → email known visit schools the COO picks (not a school-table export) using the template below → **Open** public requests.

### Email template

Subject: Book reservations for your school visit

Body:

We’re opening title reservations for schools we visit. This is not the classroom application on joyforbooks.org/freebooks (that cycle is closed; we do not ship a 10-book classroom set from this link).

Open https://ops.joyforbooks.org/request-books — submitting reserves copies for your visit. Reply if the school name or address is wrong.

### Close requests again

Use **Held closed** whenever you need a freeze (physical recount, shortage cleanup, a `/freebooks` application cycle, or a deliberate pause). Save, then confirm `/request-books` shows the hold message and no available titles. Re-open only after the reconcile checklist below is clean **and** `/freebooks` is not in an open cycle.

## Reconcile shelf counts with the ledger

Do this after cutover and any time the shelf and the app disagree. Notion is not the count source.

1. Walk the physical shelf. For each title, write `isbn,quantity` (same shape as launch `counts.csv`).
2. Open **Inventory**. For every live title, compare **On hand** to the shelf quantity.
   - Match: no write.
   - First-time zero stock with no movements: **Record opening balance** with reason (for example `2026-09-27 shelf count`).
   - Any other drift: **Correct on-hand quantity** with a reasoned note (for example `2026-09-27 shelf recount; missing 2 copies`). That appends an `adjustment` movement; do not invent stock outside the ledger.
3. Clear or own exceptions before trusting availability:
   - **Inventory → Shortage exceptions** (on hand below active reservations).
   - **Requests → Request exceptions** (unmatched / ambiguous school attach, reservation shortage).
   - **Requests → Active requests** (stale actives you still mean to fulfill, cancel, or decline).
   - **Visits → Visit exceptions** (ambiguous reservation consumption).
4. Spot-check `/request-books`: available copies must equal on hand minus active reservations for each title. Titles with zero availability stay off the public list.

A clean reconcile means every live title’s on-hand matches the shelf (or a reasoned ledger adjustment), and exception queues are empty or explicitly owned by staff.

## Book popularity export

Staff can download the currently filtered and sorted Book popularity rows as CSV or PDF from **Book popularity**. Both files use the same visible rows: title, author, request count, donated copies, and average rubric score. The PDF is the shareable copy for ordering conversations; CSV remains the spreadsheet path. Empty scores show as blank in CSV and as “No reviews” in the PDF.

## Routine work

- Book reviews are a purchase signal. A submitted review is recorded even when that book is not in inventory. Incoming forms should not wait for a catalog match before accepting a review.
- Pending intake and failed sheet polls belong on Incoming forms and Settings. Do not wait for an engineer to notice a 403.
- Reservation shortages stay visible until you release or fulfill the affected request.
- Notion remains a read-only archive after cutover. Nothing in this app writes back to Notion; do not re-enable Notion as an operational store.
- Operational records are kept. Do not paste service-account JSON, raw form dumps, or Notion MCP exports into chat, tickets, or recap emails.
