---
name: Paper-cycle concurrency
description: Transactional concurrency rule for autonomous paper-trading cycles.
---

Paper-trading cycles must compare the portfolio generation they originally read and advance it only inside the same transaction that commits all position, execution, and accounting changes. A failed or incomplete cycle must not advance the generation.

Persistent scheduler retries also need an idempotency claim acquired or recovered with one atomic compare-and-set. A failed due slot must remain due until that claim reaches a terminal result. Server controls such as KILL must serialize with the final persistence transaction and be rechecked inside that transaction.

**Why:** Concurrent manual or scheduled cycles can otherwise duplicate positions, close the same position twice, or overwrite newer cash and equity. A read-then-update claim recovery lets two retries both become owners, while a one-time preflight kill check lets an in-flight cycle commit after KILL.

**How to apply:** Treat portfolio generations and retry claims as compare-and-swap guards. Recover only FAILED or provably stale claims in the conditional update itself. Share a per-user transactional lock between execution controls and final writes, then re-read controls before committing.