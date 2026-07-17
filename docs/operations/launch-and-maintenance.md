# Launch and maintenance

1. Configure a custom Vercel domain, Clerk production instance, Convex deployment, and staff allowlist.
2. Grant the COO-owned Google integration identity read-only access to each approved Sheet and tab; store credentials only in managed environment configuration.
3. Run the Notion import in dry-run mode, correct invalid rows, then load opening balances from the physical inventory count. Historical visits must not create stock movements.
4. Reconcile every title before enabling the public request page. Review pending intake, stale requests, and reservation shortages routinely.
5. Revoke or rotate Google and school-request credentials when access changes. Raw intake payloads are purged after 180 days; operational records are retained.
