# Public school request

Schools request available donation titles at `/request-books`. Submit reserves copies. It does not change fundraising-store inventory. A hold hides the form and shows the hold status. When the form renders with no requestable titles, status says no titles are available.

## Sub-features

- `request-open` shows the Request books heading, Available titles heading, and form fields.
- `request-empty` shows the unavailable status when no titles can be requested.
- `request-submit` shows a reference after a valid reserve (mocked API is allowed for first proof).
- `request-required` keeps native required fields from posting an empty form.

## How to get to it (user POV)

- Open `/request-books`.
- From `/`, choose `Request books for your school`.

## Driving it with Playwright

Preconditions:

- Isolated server on 3101 in E2E unconfigured mode, or Playwright config webServer with 3000 free.
- Doctor passed. The HTML includes `School name`.

- **Open form.** Go to `/request-books`. Run `node .cursor/skills/verify-combinotion/drive.mjs --base-url http://127.0.0.1:3101 --feature public-request`. Expect heading `Request books`. Expect heading `Available titles`. Expect labels `School name`, `School address`, `Contact name`, `Email`.
- **Empty / hold state.** Expect a status containing `No titles are available to request right now.` when no requestable titles exist (E2E unconfigured or production hold).
- **Valid submit (mocked).** Route `**/api/school-requests` to 201 with reference `JFB-TEST1234`. Fill `School name` Joy School, `School address` 1 Main Street, `Contact name` Pat Reader, `Email` pat@example.com, `Title ISBN` 9780000000001, `Copies` 2. Click `Reserve requested copies`. Status contains `Request received: JFB-TEST1234`.
- **Required fields.** Reload `/request-books`, click `Reserve requested copies` with empty fields. `School name` is focused. The API is not called.
- **Proof.** Screenshot `artifacts/public-request/form.png` with the heading visible. Keep `artifacts/public-request/proof.txt` and `aria.txt`.

## Gotchas

- Live Convex with public requests held shows `Public book requests are closed` (or a custom hold) and hides the form. That is not a failure of the form, and it is not E2E unconfigured mode. A Convex query failure leaves the form up with the empty-titles status instead of a hold.
- `Title ISBN` and `Copies` exist only when `allowUnconfiguredEntry` is on (empty Convex URL plus `NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS=1`). Live titles use `Copies of <title>` instead.
- Do not submit a real reserve against production to prove the button works.
- Playwright default config takes port 3000. Use 3101 plus `drive.mjs` if 3000 is busy.
