---
name: Paper-cycle concurrency
description: Transactional concurrency rule for autonomous paper-trading cycles.
---

Paper-trading cycles must compare the portfolio generation they originally read and advance it only inside the same transaction that commits all position, execution, and accounting changes. A failed or incomplete cycle must not advance the generation.

**Why:** Concurrent manual or scheduled cycles can otherwise duplicate positions, close the same position twice, or overwrite newer cash and equity. Advancing the generation before external market or AI work also turns harmless provider failures into persistent state changes.

**How to apply:** Treat the portfolio generation as a compare-and-swap guard for every cycle write path. Roll back all related writes when the expected generation no longer matches, and fail closed when a complete set of official executable quotes is unavailable.