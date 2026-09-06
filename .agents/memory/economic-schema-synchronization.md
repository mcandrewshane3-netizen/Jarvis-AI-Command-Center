---
name: Economic schema synchronization
description: How to keep Economic Engine schema declarations and the development database aligned.
---

Rebuild the shared database declarations before typechecking API consumers, then verify important live columns and indexes after applying a schema push.

**Why:** A schema push reported success while the development table still exposed its previous compact shape; rerunning after rebuilding the shared database package applied the expected columns and index.

**How to apply:** For Economic Engine schema changes, rebuild the shared DB package, run the supported schema push, and inspect the affected table metadata before diagnosing application writes.