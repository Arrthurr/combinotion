# Architecture review closeout

This note records the bounded outcomes that are easy to mistake for unfinished versions of broader proposals. The nine-item architecture review is settled; this is not a roadmap and does not reopen any item. The historical review report remains a proposal artifact rather than the authority for these outcomes.

## Review title matching (candidate 1)

The shipped scope matches an incoming review to a Title by normalized ISBN first. If that does not match, it falls back to normalized title text only when exactly one Title matches. An ambiguous title-text match remains unlinked for staff to resolve. This behavior and a mutation/query test seam were explicitly confirmed in the [decision thread](https://ampcode.com/threads/T-01a0f3e2-05b3-77cb-8a82-aaa5c5c6575d) and shipped in [commit `654c75c`](https://github.com/Arrthurr/combinotion/commit/654c75c).

The broader proposal to create or consolidate a Title catalog was not implemented in this slice. The thread records it as outside the implemented scope, but records no human-approved rationale or revisit condition. Do not infer that it was permanently rejected or that its deferral was a product decision.

## Notion import preview/apply parity (candidate 5)

The shipped Notion importer has dependency-aware planning, deterministic ordering, catalog preflight, explicit skip reporting, and a digest over the ordered valid input rows. It does **not** seal the catalog-dependent effects previewed by a dry run. Apply loads the current import records, Titles, and inventory movements and recomputes the plan. A catalog change between preview and apply can therefore change reuse, blocking, opening-balance eligibility, or resolved and skipped visit relationships without changing the payload digest.

This is an implementation limitation, not a recorded product acceptance or permanent rejection of strict preview/apply parity. The [implementation thread](https://ampcode.com/threads/T-01a0f48e-e12f-745e-9120-b33b7c36669f) explains why the CLI preview used a payload-only digest, and the behavior shipped in [commit `956ae11`](https://github.com/Arrthurr/combinotion/commit/956ae11). A technically meaningful revisit would require CLI and Convex to plan against compatible catalog state and would need to bind catalog-dependent effects, including reservation quantities and visit people, to the preview. This states a prerequisite, not a promised roadmap item.

## Editor drafts provenance gap (candidate 6)

The available [candidate-6 thread](https://ampcode.com/threads/T-01a0f4c1-6c20-72e7-985c-2fb078110de2) contains a numbering correction: its donor/school-resolution subject was candidate 4, while candidate 6 was editor drafts. It records no substantive editor-drafts disposition or implementation. No separate decision source was recovered.

Candidate 6 is still treated as settled, as directed during closeout, and is not being reopened here. Its exact disposition and rationale are unknown; do not describe it as implemented, rejected, or intentionally deferred unless a primary decision source is recovered.
