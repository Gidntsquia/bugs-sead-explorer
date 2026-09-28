---
name: helophorus-no-mcr
description: Helophorus rufipes has no MCR temperature data in BugsCEP or SEAD, although PLAN.md assumed it did
metadata:
  type: project
---

Helophorus rufipes (BugsCEP 7.005001, SEAD taxon 29816) has no MCR row in BugsCEP TMCRSummaryData or in SEAD tbl_mcr_summary_data/tbl_mcr_names. Only 436 taxa have MCR data.

**Why:** PLAN.md's acceptance criterion expected MCR for this species. The app shows a "no temperature range" message instead, and uses Aphodius prodromus (85.019044) as the MCR example.

**How to apply:** If an evaluator flags missing MCR for this species, it's a data fact, not a bug. Don't fabricate a range.
