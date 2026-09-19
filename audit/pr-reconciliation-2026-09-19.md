# PR reconciliation checkpoint — 2026-09-19

## Status

Phase 0: COMPLETE
Phase 1: COMPLETE

Purpose: freeze the current GitHub state before any further reconciliation or code changes. This file is the restart point for subsequent audit phases.

## Repository snapshot

- Repository: `nswa17/utab`
- Default branch: `main`
- `main` head: `6438f0b3b9586a96fe40e2ea887950bee34c3571`
- Existing cumulative audit branch: `codex/utab-bug-audit-20260918`
- Cumulative audit branch head: `2bb9f1ece2886fd4409af781c6ddc5a7106a9020`
- Open PR count: 8 (#34–#41)
- Bookkeeping branch: `audit/pr-reconciliation-2026-09-19`

No application code was changed by Phase 0 or Phase 1.

## Open PR snapshot

| PR | Title | Base | Head | Mergeable | Current CI | Direct dependency |
|---|---|---|---|---|---|---|
| #34 | Fix core allocation and vote-rate invariants | `main` @ `6438f0b3` | `audit/core-invariants-phase3` @ `1b78cea2` | yes | run `35415799261`: success | none |
| #35 | Add compiled metamorphic invariants | `main` @ `6438f0b3` | `audit/compiled-metamorphic-phase4` @ `130d0fa3` | yes | run `35445680122`: success | none |
| #36 | Harden server state transitions against lost updates | `main` @ `6438f0b3` | `audit/server-state-races-phase5` @ `eef5d126` | yes | run `35454152393`: success | none |
| #37 | Scope tournament membership responses safely | `main` @ `6438f0b3` | `audit/auth-public-boundaries-phase6` @ `6d164672` | yes | run `35454565783`: success | none |
| #38 | Keep web stores synchronized across tournament switches | `main` @ `6438f0b3` | `audit/web-state-sync-phase7` @ `352ba0c6` | yes | run `35453983648`: success | none |
| #39 | Fix regressions from recent UTab PRs | `main` @ `6438f0b3` | `audit/recent-pr-regressions-phase8` @ `8ded872f` | yes | run `35449749829`: success | none |
| #40 | Harden boundary and type validation | `main` @ `6438f0b3` | `audit/boundary-type-phase9` @ `18065df8` | yes | run `35453505179`: success | none |
| #41 | Exercise full tournament lifecycle and PDA workflows | `audit/boundary-type-phase9` | `audit/full-e2e-lifecycle-phase10` @ `e485f374` | yes | run `35460904815`: success | #40 |

All eight latest PR-head workflow runs are completed successfully. GitHub currently reports all eight PRs mergeable.

## Phase 1 reconciliation results

Scope rule: verify only previously reported fixes and their regression coverage on the current PR heads. No unrelated bug search.

| PR | Implementation survival | Regression-test survival | Result |
|---|---|---|---|
| #34 | weighted allocation weights, strict availability filtering, vote-rate correction remain in diff | weighted-filter, strict-unavailable-team, and vote-rate assertions remain | PASS |
| #35 | round-selector normalization, content-based preview revision, missing draw-ballot validation remain | metamorphic round tests, stale-revision mutation test, missing-ballot/differential compile coverage remain | PASS |
| #36 | submission CAS/versioning, draw flag preservation, Submission `__v` increment during round moves remain | concurrent submission edit, concurrent draw update, omitted flag preservation, stale-edit-vs-renumber tests remain | PASS |
| #37 | tournament-scoped membership response, membership mutation lease, post-lease user refresh remain | hidden-listing/direct-access, cross-tournament membership privacy, membership-lease, post-lease refresh rollback tests remain | PASS |
| #38 | tournament-scoped store generations/state clearing and atomic `user_defined_data_patch` path remain | cross-tournament race/state-clearing tests, concurrent metadata patch integration test, admin-store source assertions remain | PASS |
| #39 | import cleanup AggregateError propagation, numeric speaker-order sort, furthest ballot-wizard progress remain | import rollback tests, double-digit speaker-order test, wizard reachability/reset tests remain | PASS |
| #40 | raw-result round validation, positive round invariants, tie-point bound, structured entity detail/template validation, namespace leases remain | invalid/fractional raw round, zero/negative tournament rounds, tie_points >1, malformed/duplicate entity details, tampered backup, namespace-lease tests remain | PASS |
| #41 | Draw-authoritative public publication and unavailable-assigned-entity edit behavior remain | lifecycle E2E publication/ballot/compile/break/renumber/export-import/delete coverage and unavailable-assigned-team/UI regressions remain | PASS |

Phase 1 found no previously reported fix whose implementation had disappeared, and no corresponding regression-test category that had disappeared from the current PR diffs.

## Stack note for #41

#41 is explicitly based on #40's branch, but its head is not ancestry-synchronized with the current #40 head.

Current refs:
- #40 branch head: `18065df8f06d04bec9e610dfdf2feb6066b20ff3`
- #41 head: `e485f374ff2ce02066a3ee71f5581bdf92830a7d`
- merge base of the two current branches: `f85b7cb45d1d65ef089d9842abb7bac052551ebf`
- compare current #40 -> #41: `diverged`, #41 is 57 commits ahead and 17 commits behind #40.

This remains intentionally unresolved after Phase 1.

## Restart protocol

Every later phase must:
1. read this file first;
2. refresh only the PR(s) being worked on;
3. perform one bounded unit of work;
4. update this file with the result and exact head/commit SHA;
5. commit/push before moving to another unit.

## Next phase

Phase 2: determine the actual PR dependency graph from the current diffs/ancestry and classify every PR as independent, depends-on, or superseded-by. Resolve classification only; do not modify application code.
