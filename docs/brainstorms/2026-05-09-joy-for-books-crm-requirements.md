---
date: 2026-05-09
topic: joy-for-books-crm
---

# Joy for Books CRM (v1)

## Summary

Build a hosted, multi-user web app that replaces Notion as the operational system of record for Joy for Books, centered on an event-spine data model so logging one school visit atomically updates participants, inventory, follow-ups, and per-title/per-person counters. v1 lands by July 31, 2026 with five core entities, three intake integrations, and two reports.

---

## Problem Frame

Joy for Books is a non-profit donating children's books to U.S. schools. Operations currently live in a network of Notion pages and databases covering people (donors, professional contacts, school staff, volunteers), books (titles, ISBNs, reviews, inventory), and surrounding workflows (Squarespace storefront, Google Form intake, school visits, follow-ups).

The org has outgrown Notion at the operations layer. The breaking-point pain is concrete: producing a recap for a single school visit took several hours of manual reconciliation across separate Notion databases. One real-world event — a school visit where readers (mixed from the donor / volunteer / board pool) read to classrooms and donated books to teachers — should be one atomic transaction. In Notion, it fans out into a dozen manual edits across disconnected pages: increment each reader's "times read" count, decrement inventory per donated title, increment per-title "times read," update the school's relationship history, and log post-event follow-ups. Errors and omissions are common; the cost is per-event and recurring.

Compounding this, the channels that *bring new schools, volunteers, and book information into the org* — the Squarespace storefront for school book requests and Google Forms for donation applications and book reviews — are disconnected from the operations layer, so intake is hand-copied from email and form responses.

---

## Actors

- A1. **Founder (primary admin)**: owns the data, logs events, runs reports, manages the system end-to-end. Sole user with full administrative responsibility.
- A2. **Trusted collaborator(s)**: 1-2 additional users (e.g., co-organizer, board member) who occasionally enter or update records. Same permissions as the founder for v1.
- A3. **School representative**: principal or teacher whose school is recorded in the CRM. Recorded in the system; does not log in.
- A4. **Reader**: any person (drawn from donors, volunteers, professionals, or board members) who participated in a school visit. Recorded; does not log in.
- A5. **Reviewer**: a person who submits a book review via the Google Form. Recorded; does not log in.
- A6. **Squarespace storefront**: external system; source of school book-request orders that flow into the CRM.
- A7. **Google Forms**: external system; source of school donation applications and book reviews that flow into the CRM.

---

## Key Flows

- F1. **Log a school visit (the event spine)**
  - **Trigger:** A1 or A2 records a recently-completed school visit.
  - **Actors:** A1/A2 (operator); A3 (school staff present); A4 (readers).
  - **Steps:**
    1. Pick the school (or create it inline if it's a first visit).
    2. Pick the principal/teacher contacts present at the event.
    3. Pick the readers (one or more people from any people category).
    4. Pick the books read aloud (titles, from the book catalog).
    5. Record the books donated and the quantity per title (typically one copy per student).
    6. Record post-event follow-up details: date, method of contact, who was contacted, and notes.
    7. Save.
  - **Outcome:** A single visit record exists. Inventory for each donated title is decremented. Per-reader "events participated" and per-title "times read" / "times donated" counters reflect the visit. Follow-up history is attached to the school. The recap PDF can be generated immediately.
  - **Covered by:** R5, R6, R7, R10, R11, R12, R20

- F2. **Storefront book request intake**
  - **Trigger:** A school places an order via the Squarespace storefront.
  - **Actors:** A3 (school placing the order); A6 (Squarespace).
  - **Steps:**
    1. Squarespace order arrives via integration.
    2. CRM matches to an existing school, or surfaces it for the operator to confirm/create.
    3. The request becomes a pending record attached to the school, with the requested titles and quantities.
    4. Operator reviews and progresses the request (downstream fulfillment workflow is out of scope for v1; the request lands and is visible).
  - **Outcome:** Storefront requests are visible in the CRM and feed the popularity report's request-count signal per title.
  - **Covered by:** R13, R14, R21

- F3. **Google Form intake (donation applications, book reviews)**
  - **Trigger:** A school submits a donation application form, or a reviewer submits a book review form.
  - **Actors:** A3 or A5 (form submitter); A7 (Google Forms).
  - **Steps:**
    1. Submission lands in the linked Google Sheet.
    2. CRM polls the sheet, detects new rows, and creates pending records.
    3. Donation applications create or attach to a school record; reviews create review records attached to the book and the reviewer.
    4. Operator reviews pending records and resolves duplicates / missing matches.
  - **Outcome:** New applications and reviews appear in the CRM without manual copy-paste. Reviews carry rubric scores and free-text feedback.
  - **Covered by:** R15, R16, R17, R22

- F4. **Generate event recap PDF**
  - **Trigger:** A1/A2 requests a recap for a logged visit.
  - **Actors:** A1/A2.
  - **Steps:**
    1. Open a visit record.
    2. Click "generate recap PDF."
    3. Download the file.
  - **Outcome:** A single shareable PDF reflects the visit: school + staff present, readers, books read, books donated (with quantities), follow-up record. Suitable for printing for the school or attaching to a thank-you email.
  - **Covered by:** R23, R24

- F5. **View book popularity report**
  - **Trigger:** A1 wants to inform an upcoming purchase decision.
  - **Actors:** A1.
  - **Steps:**
    1. Open the popularity report.
    2. Sort or filter by any of the three signal columns.
  - **Outcome:** Per title: storefront request count, donation count, average rubric score — viewable as three independent columns/views. Drives which titles to order and which to drop.
  - **Covered by:** R25, R26, R27

---

## Requirements

**People and entities**
- R1. The system stores Donors, Professional contacts, Volunteers, and School staff (principals, teachers) as people records. A single person may carry multiple role tags (e.g., donor + board member; volunteer + reviewer).
- R2. The system stores Schools as records distinct from school staff. Each school has one or more associated staff people (principal, teacher) and a contact/relationship history.
- R3. The system stores Books as catalog records with title, author(s), ISBN, purchase price, and operator notes/comments.
- R4. The system stores Distributors minimally as vendor records (name + contact info), referenceable from book records. No distributor-management workflow in v1.

**Event spine**
- R5. The system stores School Visits (events) as first-class records, each linking: a school, school staff present, readers (one or more people), books read aloud, books donated (with per-title quantity), and post-event follow-up details (date, method, who was contacted, notes).
- R6. Inventory-on-hand per book is decremented automatically when a visit recording the donation of that book is saved. Edits or deletions of a visit must reverse and reapply the inventory effect correctly.
- R7. Per-person "events participated" / "books read" counters and per-title "times read" / "times donated" counters are *derived* from event participation rather than independently editable fields.
- R8. The book catalog supports a per-title quantity-on-hand value, adjustable directly by an operator (for purchase intake, manual corrections, and starting balances).
- R9. A visit can be edited or deleted; changes propagate to all derived counters and inventory.

**Reviews**
- R10. The system stores Book Reviews as one-to-many records attached to a book; each review carries a reviewer, free-text feedback, and a numeric rubric score.
- R11. A review may be marked approved or excluded for storefront use. The approval flag governs which feedback is surfaced for storefront copy-paste; rubric scores feed the popularity report regardless.
- R12. The system surfaces, per book, a view of approved review feedback suitable for manual copy-paste into the Squarespace storefront product description.

**Intake integrations**
- R13. The system ingests Squarespace storefront orders for school book requests, creating a pending request record per order, attached to (or proposing creation of) a school record.
- R14. Storefront orders that cannot be auto-matched to an existing school surface as pending matches for operator resolution rather than failing silently.
- R15. The system ingests Google Form submissions for school donation applications, creating a pending application record per submission, attached to (or proposing creation of) a school record.
- R16. The system ingests Google Form submissions for book reviews, creating a review record per submission, attached to the corresponding book (and reviewer) — surfacing for operator resolution if the book or reviewer cannot be matched.
- R17. Form intake polls (or webhooks where supported) detect new submissions without requiring manual import; operator does not need to copy data by hand.

**Reports**
- R20. The system generates a per-event recap PDF for any logged school visit.
- R23. The recap PDF includes: school + staff present, readers, books read aloud, books donated with quantities, and the follow-up record.
- R24. The recap PDF is a single shareable file suitable for printing or email attachment.
- R25. The system provides a Book Popularity report with one row per title and three independent signal columns: storefront request count, donation count, and average rubric score.
- R26. The popularity report supports sorting and filtering by any of the three columns independently. The columns are not blended into a single ranked score.
- R27. The popularity report is exportable to CSV (and PDF where useful).

**Auth and access**
- R30. The system requires authentication for all data access. Anonymous users see only a sign-in screen.
- R31. v1 supports 1-3 user accounts. All authenticated users share the same effective permissions; no role hierarchy.

**Migration and data lifecycle**
- R40. Pre-v1 data migration imports active people directories (donors, professionals, school staff, volunteers), the school directory, the book catalog, and a current physical inventory snapshot per title.
- R41. Pre-v1 data migration imports approximately the last 6-12 months of storefront requests, school visits, and book reviews, sufficient to make the popularity report meaningful on day one.
- R42. Notion remains available read-only as the historical archive for everything not imported. No automated sync from the CRM back to Notion.

**Hosting**
- R50. The system is deployed to a hosted environment (publicly reachable URL) by July 31, 2026. No local-only / self-hosted-on-laptop deployment.

---

## Acceptance Examples

- AE1. **Covers R5, R6, R7.** Given a book with quantity-on-hand of 25 and per-title counters at zero, when a visit is saved that records that book as donated in quantity 20 with two readers, then inventory becomes 5, the title's "times donated" reflects this visit, and each reader's "events participated" reflects this visit.
- AE2. **Covers R9.** Given the visit in AE1, when the visit is edited to change the donated quantity from 20 to 22, then inventory becomes 3 (the original decrement is reversed and the new decrement is applied).
- AE3. **Covers R9.** Given the visit in AE1, when the visit is deleted, then inventory returns to 25 and all counters revert as if the visit was never recorded.
- AE4. **Covers R11, R12.** Given a book with three reviews — two approved for storefront, one excluded — when an operator opens the book's storefront-feedback view, then only the two approved reviews' feedback is shown for copy-paste; when the popularity report is opened, the average rubric score includes all three reviews.
- AE5. **Covers R14, R16.** Given a Squarespace order for a school whose name does not match any existing school record, when the order is ingested, then it appears in a pending-matches view rather than being silently dropped or duplicating an existing school.
- AE6. **Covers R26.** Given the popularity report, when the operator sorts by average rubric score descending, then the request-count and donation-count columns remain visible alongside, and the operator can re-sort by either of those columns independently.

---

## Success Criteria

- **Per-event time cost drops from hours to minutes.** Logging a school visit and producing the recap PDF takes the founder under 15 minutes end-to-end (vs. several hours in Notion today).
- **Atomic event recording is reliable.** No visit recorded in v1 leaves stale or contradictory state across inventory, per-person counters, or per-title counters.
- **The system survives the first three months without manual reconciliation.** No recurring "I had to fix things by hand in the database" episodes.
- **Intake channels stop creating copy-paste work.** New storefront orders, donation applications, and book reviews appear in the CRM without manual entry.
- **The popularity report drives at least one purchase-decision change** in the first ordering cycle after launch — i.e., the founder uses it to add or drop titles.
- **Handoff quality:** ce-plan can produce an implementation plan from this document without inventing additional product behavior, scope boundaries, or success criteria.

---

## Scope Boundaries

- Google Form integration for volunteer signups (volunteers are entered manually in v1).
- Distributor ordering / management workflow beyond a name + contact reference.
- Year-end and org-wide financial / revenue reports (CSV export from underlying tables is the v1 stopgap).
- Multi-role permission tiers (admin / staff / volunteer / school-facing).
- Automated push to Squarespace — storefront product descriptions, donor data, inventory levels. v1 is read-from-Squarespace only; storefront copy is updated manually.
- Donor giving history reports and thank-you packet generation.
- Volunteer self-service portal (volunteers logging their own participation, RSVPs, profile updates).
- School-facing portal (schools logging in to view their own visit history).
- Full historical Notion migration. Past records older than ~6-12 months stay in Notion as read-only archive.
- Mobile app or offline-first field data entry.
- Fulfillment workflow for storefront requests beyond receiving and visualizing them (no pick/pack/ship, no shipping label generation).
- Automated review-to-storefront-description publishing.

---

## Key Decisions

- **Event-spine data model.** Per-person and per-title counters are derived from school-visit records, not independently editable. Rationale: the founder's recurring multi-hour reconciliation pain comes from manually keeping independent counters in sync. Making them derived eliminates the class of problem rather than easing it.
- **Reviews included in v1.** Originally bucketed as "honestly, never use" but pulled into v1 once their dual role surfaced — reviews drive both storefront copy and ordering decisions, which were already v1 commitments. Rationale: omitting reviews would have made v1 less than the sum of its parts.
- **Three separate columns in the popularity report.** Request count, donation count, and rubric score are presented as independent columns/views rather than blended into a single ranked score. Rationale: each signal answers a different ordering question; blending hides them.
- **Manual storefront-description publishing.** The CRM surfaces approved review feedback for copy-paste rather than pushing it to Squarespace automatically. Rationale: automated publishing would meaningfully expand v1's Squarespace integration scope and introduce write-side risk; the founder has accepted manual paste as the v1 trade-off.
- **1-3 users, flat permissions.** No role hierarchy in v1. Rationale: matches the actual access pattern (founder + tiny circle); a permission model adds carrying cost out of proportion to v1 needs.
- **Migrate active records + 6-12 months of activity, not full history.** Notion remains read-only for older data. Rationale: a hard July 31 deadline; full historical migration would add weeks of data-cleanup risk for marginal early-system value.
- **Distributors as minimal references.** Vendor name + contact only; no distributor workflow. Rationale: no concrete v1 workflow needs more, despite the founder labeling distributors "nice eventually."

---

## Dependencies / Assumptions

- The Squarespace storefront uses Squarespace Commerce (orders API + webhooks) rather than only static form blocks. If it does not, the storefront integration approach must be re-evaluated during planning. *Unverified — confirm during planning.*
- The donation-application Google Form and book-review Google Form are configured (or can be configured) to write submissions to a Google Sheet that the CRM can read. *Standard Google Forms behavior; confirmable during planning.*
- The founder can produce a clean export from each relevant Notion database for the migration import (CSV or equivalent).
- The founder will perform a full physical inventory count near the launch date so the v1 inventory snapshot is accurate on day one.
- A single competent developer working productively can deliver this scope by July 31, 2026 with a modern hosted-app stack. ce-plan should pressure-test this when picking tools.

---

## Outstanding Questions

### Resolve Before Planning

*(none — all scope-shaping decisions resolved in dialogue)*

### Deferred to Planning

- [Affects R13, R14][Needs research] Does the Squarespace storefront use Squarespace Commerce (with its full orders API and webhook surface) or only form-block-based ordering? Determines whether the integration is webhook-driven or polling-driven and how much logic falls on the CRM side.
- [Affects R15, R16, R17][Technical] Polling cadence vs. webhook strategy for Google Form intake (Forms → Sheets → CRM). Decision belongs in planning where API surface and hosting choice are pinned down.
- [Affects R20, R23, R24, R27][Technical] PDF rendering approach (server-side HTML-to-PDF, headless browser, dedicated library). Pure implementation choice.
- [Affects R30, R31][Technical] Auth mechanism (managed identity provider vs. self-hosted email-magic-link). Pure implementation choice; the requirement is "authentication exists for 1-3 users with flat permissions."
- [Affects R40, R41][Technical] Migration script strategy from Notion exports. Schema-shaped; belongs in planning once the v1 schema is set.
- [Affects R50][Technical] Hosting platform and underlying stack. Pure implementation choice.

---

## Deferred / Open Questions

### From 2026-05-09 review

- **F2 and F3 reference requirements R21 and R22 that do not exist** — Key Flows (F2, F3) and Requirements (P1, coherence, confidence 100)

  Planners and implementers use the 'Covered by' lists as traceability between flows and requirements. F2 cites R21 and F3 cites R22, but the Requirements section jumps from R20 directly to R23 with no R21 or R22 defined anywhere in the document. Anyone following the trace will hit a dead end and not know whether a requirement is missing or the citation is wrong.

  <!-- dedup-key: section="key flows f2 f3 and requirements" title="f2 and f3 reference requirements r21 and r22 that do not exist" evidence="F2 'Covered by: R13, R14, R21' (Key Flows section)" -->

- **Pending-match resolution surface is undefined** — F2 Storefront request intake; F3 Google Form intake; R13-R16; AE5 (P1, design-lens, confidence 100)

  Operators will face pending Squarespace orders, donation applications, and book reviews that need human matching, but the doc never specifies what the resolution surface looks like. Implementers will invent the queue UI, the actions available (confirm match, reject, create new entity, merge duplicates), what data is shown alongside each pending item to make a decision, and what happens to the order/application when a match is rejected vs deferred. This is the highest-frequency repeated interaction in the system and the one that distinguishes the CRM from Notion, so guesswork here directly produces the daily-driver UX.

  <!-- dedup-key: section="f2 storefront request intake f3 google form intake r13r16 ae5" title="pendingmatch resolution surface is undefined" evidence="F2: 'CRM matches school OR surfaces for operator confirm/create → pending request attached to school → operator p" -->

- **Inline-create-during-visit-logging interaction is unspecified** — F1 Log school visit (P1, design-lens, confidence 100)

  The visit-logging flow is the daily action and pickers exist for school, principal/teacher, readers, and books — but only school explicitly says 'or create inline.' Implementers will have to invent whether create-inline applies to all picker types, whether it opens a modal/inline form/side panel, what fields are required at minimum (does a school need an address? does a person need an email?), and whether a half-filled visit can be saved while the new entity is being created. Inconsistent answers across pickers will fragment the most-used flow.

  <!-- dedup-key: section="f1 log school visit" title="inlinecreateduringvisitlogging interaction is unspecified" evidence="F1: 'pick school (or create inline) → pick principal/teacher present → pick readers → pick books read aloud'" -->

- **Buy-vs-build is treated as a settled premise; no alternative evaluated** — Summary / Problem Frame / Key Decisions (P1, product-lens, confidence 75)

  For a 1-3 user nonprofit, committing a single developer to a custom hosted CRM is a heavy, multi-year maintenance bet. The document jumps from 'Notion has outgrown its role' to 'build a hosted multi-user web app' without examining whether a relational tool with native automations (Airtable), a restructured Notion with rollups, or a sector-specific donor CRM could solve the event fan-out and intake problems at a fraction of the build and upkeep cost. If a no/low-code option would close the recap and intake gaps, the right answer may not be a custom app at all.

  <!-- dedup-key: section="summary problem frame key decisions" title="buyvsbuild is treated as a settled premise no alternative evaluated" evidence="Summary: 'Hosted, multi-user web app replacing Notion as the operational system of record'" -->

- **Workaround risk unexamined: no inventory of Notion behaviors that must be preserved** — Problem Frame / Requirements / Success Criteria (P1, product-lens, confidence 75)

  Internal-captive users route around tools that are worse than what they replaced at any common task. The document catalogs what Notion does badly (visit fan-out, intake) but never the things the founder currently does well in Notion — quick free-form notes, ad-hoc views, attaching context to records, etc. If the new CRM is rigid where Notion was flexible, the founder will keep using Notion alongside it and the success criterion 'three months without manual reconciliation' fails not because the system is wrong but because adoption is partial. The plan needs to identify the must-preserve Notion strengths before locking the data model.

  <!-- dedup-key: section="problem frame requirements success criteria" title="workaround risk unexamined no inventory of notion behaviors that must be preserved" evidence="Problem Frame describes only Notion's weaknesses, not its strengths" -->

- **Sustainability after launch unaddressed for a custom hosted system at a tiny org** — Dependencies / Assumptions / Scope Boundaries (P1, product-lens, confidence 75)

  A hosted, publicly reachable, multi-integration web app has ongoing costs the document doesn't price: hosting bills, Squarespace/Google API drift, security patches, bug fixes, and the eventual departure of the launching developer. With 1-3 users at a nonprofit and no named owner for month-6/month-12 operation, the system risks decaying into a worse Notion — locked-in data, broken integrations, no one to fix it. The compounding direction here is negative (every requirement is a permanent maintenance surface), and that should shape what's in v1 versus what's deferred or solved with a simpler tool.

  <!-- dedup-key: section="dependencies assumptions scope boundaries" title="sustainability after launch unaddressed for a custom hosted system at a tiny org" evidence="Summary: 'Hosted, publicly reachable URL by July 31, 2026'" -->

- **Visit edit/delete propagation has no operator-facing UX defined** — R6, R9, AE1-3 (P1, design-lens, confidence 75)

  Visits 'reverse-then-reapply' on edit and propagate on delete, touching inventory and derived counters. The doc commits to the data behavior but says nothing about what the operator sees: a confirmation showing inventory deltas before saving, what happens if reverse-then-reapply transiently produces negative inventory, whether the operator can preview the propagation, or how a destructive delete is communicated. Without this, implementers will either skip confirmation (silent destructive edits) or invent a generic 'are you sure?' that hides the actual stake.

  <!-- dedup-key: section="r6 r9 ae13" title="visit editdelete propagation has no operatorfacing ux defined" evidence="R6: 'Inventory auto-decrement; edits/deletes reverse-then-reapply.'" -->

- **No information architecture or surfacing model for pending work** — Whole document; F2, F3, R13-R16, R17 (P1, design-lens, confidence 75)

  Pending matches arrive asynchronously via polling/webhook, but the doc never says how the operator becomes aware of them — no home screen, no inbox/queue priority, no badge count, no notification channel. If the operator has to remember to open a 'pending matches' view, items will rot and orders/reviews will be lost. Implementers will either invent a notification system (which may be wrong for a 1-3 person team) or bury the queue and produce silent failures of the intake flows.

  <!-- dedup-key: section="whole document f2 f3 r13r16 r17" title="no information architecture or surfacing model for pending work" evidence="R17: 'Polling/webhook intake; no manual copy.' — async arrival is committed." -->

- **Secret/credential handling for Squarespace and Google integrations not addressed** — Integrations / Deferred to Planning (P1, security-lens, confidence 75)

  Squarespace Commerce API and Google Forms/Sheets access both require long-lived credentials (API keys, OAuth tokens, or service-account JSON) that, if leaked, expose donor order data and any Sheet the CRM can read. The requirements name the integrations but say nothing about where these credentials live, who can read them, or how they rotate. Without a stated minimum (e.g., server-side secret store, no checked-in keys, owner-only access), planning will likely default to whatever is convenient — env vars in a hosting console, or worse, in a config file — and there is no requirement to push back against. This is the single most common breach vector for small-team SaaS replacements.

  <!-- dedup-key: section="integrations deferred to planning" title="secretcredential handling for squarespace and google integrations not addressed" evidence="Squarespace storefront → orders ingestion (R13, R14). Assumed Commerce API (UNVERIFIED)." -->

- **Account provisioning model unspecified for publicly hosted app** — Auth / Hosting (P1, security-lens, confidence 75)

  The app is reachable at a public URL (R50) and requires auth (R30), but nothing in the requirements says how the 1-3 accounts come into existence — invite-only by the founder, self-service signup gated by an allowlist, or open registration. If planning defaults to a managed IdP with self-service signup enabled (a common default), a stranger can create an account on the public URL; they may not see data, but the user list itself becomes an attack surface and trust signal. State explicitly that account creation is closed/invite-only or restricted to a known email allowlist.

  <!-- dedup-key: section="auth hosting" title="account provisioning model unspecified for publicly hosted app" evidence="R30. Auth required for all data access. Anonymous users see only sign-in screen." -->

- **No minimum stated for donor PII protection at rest, retention, or export** — Stored data (P1, security-lens, confidence 75)

  The system stores donor contact info, likely addresses, and possibly giving history — exactly the categories that create reputational and (in some jurisdictions) regulatory exposure if breached. The requirements list these fields but set no minimum on encryption at rest, backup handling, retention/deletion of departed donors, or what happens if a donor requests their data be removed. Without a baseline now, planning will pick a hosting/database default and move on, and the non-profit will inherit whatever that vendor provides with no documented decision to point to.

  <!-- dedup-key: section="stored data" title="no minimum stated for donor pii protection at rest retention or export" evidence="Donors (PII: contact info, presumably address, possibly giving history not in v1 reports but still in DB)" -->

- **Reverse-and-reapply inventory composes only if R8 manual adjustments are stored as timestamped deltas, which the doc does not specify** — Requirements (full) — Event spine (R6, R8, R9); Acceptance Examples (AE2) (P1, adversarial, confidence 75)

  Editing a visit after any R8 adjustment will silently produce the wrong on-hand quantity unless every adjustment is persisted as a signed delta at a specific point in the event timeline. AE2 only validates the no-adjustment case; a realistic interleaving (start 25 → visit donates 20 → operator records intake +10 → edit visit to 22) gives 13 if adjustments are deltas, but a different value if R8 stores absolute settings or is applied at read time. Because this primitive underwrites the entire event-spine claim, silent drift here defeats the architectural premise the doc was written to defend. Decide and document the adjustment data model now, not at implementation time.

  <!-- dedup-key: section="requirements full  event spine r6 r8 r9 acceptance examples ae2" title="reverseandreapply inventory composes only if r8 manual adjustments are stored as timestamped deltas which the doc does not specify" evidence="R6: 'Inventory auto-decrement on save; edits/deletes reverse-then-reapply correctly.'" -->

- **Visit deletion erases history without an audit trail; CRM will contradict already-sent recap PDFs** — Requirements (full) — Event spine (R9); Acceptance Examples (AE3); Key Flows (F4) (P1, adversarial, confidence 75)

  A recap PDF emailed to a school in March documents books physically donated; deleting that visit in May leaves the school holding evidence of an event the CRM denies. The data model conflates 'fix a typo' with 'this never happened,' so the founder cannot later answer 'what did we previously believe was true?' — which is the exact reconciliation pain that drove the rebuild. With derived counters there is no parallel record to detect that history was rewritten, so the success criterion '3 months without manual reconciliation' is unfalsifiable from inside the system. Add at minimum a soft-delete/correction flag and a notion of 'as-of' for issued artifacts.

  <!-- dedup-key: section="requirements full  event spine r9 acceptance examples ae3 key flows f4" title="visit deletion erases history without an audit trail crm will contradict alreadysent recap pdfs" evidence="R9: 'Visit edits/deletes propagate to all derived counters and inventory.'" -->

- **Squarespace school-matching depends on order payloads carrying a structured school identifier — an assumption stronger than the flagged 'API unverified'** — Key Flows (F2); Requirements (R13, R14); Acceptance Examples (AE5); Dependencies / Assumptions (P1, adversarial, confidence 75)

  The UNVERIFIED tag covers API access but not the load-bearing assumption that orders contain a discoverable school identity. Squarespace storefront orders typically expose buyer name + shipping address + optional custom fields, not a normalized 'school' record — making 'match to school' an address-geocoding or fuzzy-name problem against operator-typed values, not a key lookup. If most orders default to pending-matches (e.g., teachers ordering with personal addresses), the success criterion 'intake stops copy-paste' fails even when the integration 'works.' Inspect one week of real order JSON before scoping F2; if the school field is absent, the matching design and the storefront's order form both need changes.

  <!-- dedup-key: section="key flows f2 requirements r13 r14 acceptance examples ae5 dependencies  assumptions" title="squarespace schoolmatching depends on order payloads carrying a structured school identifier  an assumption stronger than the flagged api unverified" evidence="F2: 'Squarespace order arrives → CRM matches to school OR surfaces for confirm/create → pending request attached.'" -->

- **F1 'Covered by' lists review requirements (R10–R12) that do not match its steps or outcome** — Key Flows (F1) (P2, coherence, confidence 75)

  F1 is the visit-logging flow; its steps cover school, contacts, readers, books read/donated, and follow-up — there is nothing about reviews. R10, R11, and R12 are entirely about Book Reviews (review records, approval flag, storefront-feedback view). Listing them under F1 misleads readers tracing flow→requirement coverage and obscures which requirements actually back the visit-logging behavior (notably R8/R9, which are not cited despite being directly exercised by the 'Save' step and reflected in AE2/AE3).

  <!-- dedup-key: section="key flows f1" title="f1 covered by lists review requirements r10r12 that do not match its steps or outcome" evidence="F1 'Covered by: R5, R6, R7, R10, R11, R12, R20'" -->

- **AE5 claims to cover R16 but only describes a Squarespace order scenario** — Acceptance Examples (AE5) (P2, coherence, confidence 75)

  AE5 is labeled 'Covers R14, R16' but the scenario is a Squarespace order whose school name does not match. R14 is exactly that case; R16 is about Google Form book reviews surfacing for operator resolution when book or reviewer cannot be matched — a different intake source and a different unmatched-entity case. A reader auditing requirement coverage will conclude R16 has an acceptance example when it does not, and will not catch that the analogous Google-Form-pending-match behavior is untested.

  <!-- dedup-key: section="acceptance examples ae5" title="ae5 claims to cover r16 but only describes a squarespace order scenario" evidence="AE5: 'Covers R14, R16. Given a Squarespace order for a school whose name does not match any existing school record" -->

- **Reviews-in-v1 rationale partially defeated by the manual-paste scope exclusion** — Key Decisions / Scope Boundaries (P2, product-lens, confidence 75)

  The decision to include reviews in v1 is justified as 'drive storefront + ordering,' but scope explicitly excludes 'automated review-to-storefront publishing' and notes storefront copy is manual paste. So the storefront half of the justification reduces to 'reviews exist in the database and someone copies them into Squarespace by hand' — which is roughly what happens today. That leaves 'drive ordering' as the real motivation, which is a thinner case for the v1 cost. Worth either strengthening the ordering-decision rationale, deferring reviews until automated publishing lands, or being explicit that reviews are an ordering-decision feature first and a storefront feature only incidentally.

  <!-- dedup-key: section="key decisions scope boundaries" title="reviewsinv1 rationale partially defeated by the manualpaste scope exclusion" evidence="Key Decisions: 'Reviews in v1 (drive storefront + ordering)'" -->

- **Distributors as a fifth v1 entity for two fields needs justification** — Requirements / Key Decisions (P2, scope-guardian, confidence 75)

  Distributors is listed as one of the v1 entities but its content is 'minimal — name + contact only,' and no documented flow (F1–F5), success criterion, or report consumes distributor data. With a hard July 31 deadline and a single developer, an entity earns schema, CRUD, migration, and form work — two fields' worth of value is unlikely to repay that cost. A tag on books or a flat reference list would deliver the same information without entity overhead.

  <!-- dedup-key: section="requirements key decisions" title="distributors as a fifth v1 entity for two fields needs justification" evidence="Requirements: 'Distributors (minimal — name + contact only).'" -->

- **Google Forms has no native webhooks; "polls or webhooks" framing hides an Apps Script dependency** — Intake integrations (R15, R16, R17) (P2, feasibility, confidence 75)

  Once implementation starts, the developer will discover that Google Forms exposes no webhook configuration in its UI or API — push delivery requires installing an Apps Script `onFormSubmit` trigger that calls an external endpoint, with the founder owning that script in her Google account. Polling the linked Sheet via the Sheets API works but introduces lag and quota considerations. The current requirement reads as if either approach is a config toggle, which will surprise the planner and could push intake decisions late.

  <!-- dedup-key: section="intake integrations r15 r16 r17" title="google forms has no native webhooks polls or webhooks framing hides an apps script dependency" evidence="R17: 'Polls or webhooks; no manual copy by hand.'" -->

- **Notion CSV exports drop cross-database relations needed for migration; "export cleanly" assumption is fragile** — Migration (R40, R41) and Dependencies/Assumptions (P2, feasibility, adversarial (+1 anchor), confidence 100)

  The migration depends on importing people, schools, books, inventory, and 6-12 months of storefront requests, visits, and reviews — all of which are linked in Notion via relation properties. Notion's CSV export flattens relations into label text without IDs, so a naïve export-and-import will lose the foreign keys that the event-spine model needs to wire visits to schools, readers, books, and follow-ups. This forces the developer to either use the Notion API (rate-limited, requires building a paginated export pipeline) or reconcile relations by name with manual cleanup. Either path is real work that the assumption "Founder can export each relevant Notion DB cleanly" does not surface.

  <!-- dedup-key: section="migration r40 r41 and dependenciesassumptions" title="notion csv exports drop crossdatabase relations needed for migration export cleanly assumption is fragile" evidence="Assumptions: 'Founder can export each relevant Notion DB cleanly.'" -->

- **Navigation model and entity-grouping rationale are undefined** — Whole document (P2, design-lens, confidence 75)

  The system has at least seven first-class entities (schools, people, books, visits, inventory, pending matches, reviews, popularity report) and the requirements doc names them all without committing to how they're grouped, what's primary vs secondary, or how the operator moves between them. Implementers will pick a default sidebar/tabs structure that may not match how the operator actually works (visit-centric vs school-centric vs queue-centric). This is acceptable to defer to plan stage but should be flagged as a decision the requirements doc has not made.

  <!-- dedup-key: section="whole document" title="navigation model and entitygrouping rationale are undefined" evidence="Document lists entities under Requirements (R1, R5-R9, R10-R16, R25-R27) without grouping or hierarchy." -->

- **Popularity report's three signal columns are unnamed and sort/filter semantics are vague** — F5, R25-R27, AE6 (P2, design-lens, confidence 75)

  The report references 'three signal columns' and says they sort/filter independently, but the columns are never named in the requirements doc. 'Sort independently' is also ambiguous: a single active sort column at a time vs composite multi-column sort produces very different table UX. AE6 only confirms each column can be the sort key, not whether multiple can compose. Implementers will guess both the column meanings and the sort behavior.

  <!-- dedup-key: section="f5 r25r27 ae6" title="popularity reports three signal columns are unnamed and sortfilter semantics are vague" evidence="R25-R27: 'Popularity report: 3 independent columns per title, sort/filter independently, CSV export.'" -->

- **Review-approval interaction is undefined** — R10-R12, AE4 (P2, design-lens, confidence 75)

  An approval flag on each review governs whether it appears in the storefront copy-paste view, but the doc doesn't say where the operator approves: on the review record itself, in a moderation queue, in bulk, what the default unapproved state shows, or how the operator distinguishes 'pending review intake' from 'approved-for-storefront'. Since approval is the gate between Google Form intake and customer-facing copy, implementers must invent this and may produce a flow that buries the approval action.

  <!-- dedup-key: section="r10r12 ae4" title="reviewapproval interaction is undefined" evidence="R10-R12: 'Reviews 1-many on book; approval flag governs storefront copy-paste view.'" -->

- **Empty and first-run states are not addressed** — F4, F5, F2/F3, R40-R42 (P2, design-lens, confidence 75)

  Several screens have meaningful empty states the doc doesn't address: the popularity report before any visits are logged, the pending-matches queue when nothing is pending, the storefront-feedback view before any reviews are approved, and the first-run experience post-migration. Migration brings 6-12 months of activity in, so the empty-state question intersects with the migration UX. Implementers will default to 'No data' placeholders that miss opportunities to teach the operator the next action (e.g., 'Log your first visit', 'All caught up').

  <!-- dedup-key: section="f4 f5 f2f3 r40r42" title="empty and firstrun states are not addressed" evidence="F4/F5 describe outputs without saying what the views show before data exists." -->

- **Trust boundary for Squarespace webhooks and Google Sheets ingestion not characterized** — Integrations / Dependencies (P2, security-lens, confidence 75)

  Both integrations cross a trust boundary: Squarespace webhooks (if used) must be authenticated via signature, and a Google Sheet linked to a public Form is effectively user-supplied input — anyone who can submit the Form, or anyone with edit access to the Sheet, can inject rows the CRM will read and persist. The requirements treat both as data sources without naming what is trusted vs. validated. Planning needs a stated stance: webhook payloads must be verified, and Sheet rows are untrusted input subject to validation/sanitization before they touch donor or school-staff records.

  <!-- dedup-key: section="integrations dependencies" title="trust boundary for squarespace webhooks and google sheets ingestion not characterized" evidence="Squarespace storefront → orders ingestion (R13, R14). Assumed Commerce API (UNVERIFIED)." -->
