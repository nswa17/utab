# Phase 10 audit — cumulative end-to-end integrity

Date: 2026-09-21
Branch: `audit/cumulative-e2e-phase10-20260921`
Base: `audit/round-failure-phase9-20260921`

## Scope

Run the cumulative tournament lifecycle on the Phase 9 composite head and verify that the independently hardened invariants still compose:

create tournament → membership → entities/rounds → hidden draw → staged publication → ballots/feedback → compile → break → round-scoped Result/raw rows → renumber → privacy erase → ZIP export/import → restored publication/data → draw delete → round delete.

This phase intentionally reuses the existing realistic lifecycle E2E instead of creating a parallel synthetic flow.

## Added cumulative assertions

- owner membership exists on original tournament and is recreated as organizer membership on ZIP import.
- draw publication remains authoritative through the lifecycle and restore.
- round-2 Draw and Submission versions increment twice across the two-hop renumber staging path.
- Result plus raw team/speaker/adjudicator rows move with round 2 -> 3.
- nested `source_rounds` references rewrite 2 -> 3 and are removed after restored round 3 deletion.
- adjudicator personal-data erasure clears matching submission comments and increments Submission `__v`.
- redacted adjudicator state survives ZIP export/import.
- entity namespace and round-topology leases are inactive after mutations on both original and restored tournaments.
- restored round 3 contains the expected Draw, Submission, Result, raw team, raw speaker, and raw adjudicator records.
- deleting restored round 3 leaves no round-3 records in any of those operational collections and removes entity detail/reference remnants.

## Findings

No new product blocker was found by the cumulative lifecycle sweep. The Phase 8/9 fixes compose under the tested path.

The web A-B-A stale-response protections from Phase 7/8 remain covered by dedicated web-store tests and are not duplicated in this server lifecycle test.

## Residual risk

The known Phase 9 architectural residual remains: standalone Mongo cannot guarantee multi-collection atomicity across process termination, persistent database failure, or connection loss during a lifecycle mutation. Full atomicity requires MongoDB transactions or a durable recovery journal.

Phase 10 does not broaden that architecture; it verifies that the current lease/version/retry design composes correctly across the realistic tournament lifecycle.
