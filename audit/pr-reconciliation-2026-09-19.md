# PR reconciliation checkpoint — 2026-09-19

## Status

Phase 0: COMPLETE
Phase 1: COMPLETE
Phase 2: COMPLETE
Phase 3: IN PROGRESS — #34 COMPLETE

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

## Phase 2 dependency graph

Classification semantics:
- **independent**: no commit-ancestry or semantic prerequisite on another open audit PR; may still touch overlapping files and require merge-conflict reconciliation later.
- **depends-on**: must be applied after the named PR (or rebased/retargeted onto its merged result).
- **superseded-by**: the PR's intended fixes/tests are completely replaced by another open PR, so it need not merge independently.

Ancestry result:
- Every pair among #34–#40 is `diverged` with merge base exactly current `main` at `6438f0b3b9586a96fe40e2ea887950bee34c3571`.
- Therefore none of #34–#40 contains another audit PR's commit history.
- #41 is the only explicit stack: its PR base is `audit/boundary-type-phase9` (#40).

Final classification:

| PR | Classification | Dependency | Reason |
|---|---|---|---|
| #34 | independent | none | core allocation/vote-rate fixes and tests are unique to this PR |
| #35 | independent | none | compiled metamorphic/revision/missing-data fixes are unique; shared core results file with #34 does not create a prerequisite |
| #36 | independent | none | submission/draw CAS and round-move versioning are self-contained against main |
| #37 | independent | none | tournament-membership boundary/lease changes are self-contained against main |
| #38 | independent | none | web scope/race handling plus metadata-patch semantics are self-contained against main |
| #39 | independent | none | import rollback, export ordering, and ballot wizard fixes are not fully contained in another PR |
| #40 | independent | none | boundary/type/entity-namespace work is self-contained against main |
| #41 | depends-on | #40 | PR base is #40 and Phase-10 code/test set builds on the Phase-9 entity namespace/round implementation |
 
No open PR is classified `superseded-by`.

### Overlap hotspots for later merge reconciliation

These overlaps do **not** change the dependency classification, but should be checked after each merge:

- #34 ↔ #35: `packages/core/src/results/results.ts`.
- #36 ↔ #40: `packages/server/src/controllers/rounds.ts` and integration part 4.
- #36 ↔ #41: `draws.ts`, `rounds.ts`, and integration part 4.
- #38 ↔ #39: ballot entry component and its test.
- #38 ↔ #40: tournament route plus integration part 4.
- #38 ↔ #41: admin round-allocation component/test plus integration part 4.
- #39 ↔ #40: tournament import and copy-tournament service.
- #40 ↔ #41: extensive intentional overlap (entity controllers, rounds, entity namespace guard, model/tests) because #41 is stacked on #40.
- Several otherwise independent server PRs also append to `integration.part4.test.ts`; that is a merge hotspot, not a semantic dependency.

### #41 stack state

The stack is logically `#40 -> #41`, but the branch ancestry is stale:
- current #40 head: `18065df8f06d04bec9e610dfdf2feb6066b20ff3`
- current #41 head: `e485f374ff2ce02066a3ee71f5581bdf92830a7d`
- merge base: `f85b7cb45d1d65ef089d9842abb7bac052551ebf`
- #41 is 57 commits ahead and 17 commits behind current #40.

Do not treat that drift as a second dependency. It is a synchronization task to perform when #41 is processed after #40.

## Phase 3 per-PR final audit

### PR #34 — COMPLETE / PASS

- PR: `[audit] Fix core allocation and vote-rate invariants`
- base: `main` @ `6438f0b3b9586a96fe40e2ea887950bee34c3571`
- audited head: `1b78cea2174bc94fe11ff372c96256f1233f2cbd`
- GitHub mergeability at audit time: mergeable
- application-code changes made during this final audit: none
- unresolved review threads/comments: none

Final code review:
- weighted rank fix correctly replaces the sparse `Array(n).map(...)` construction with an initialized weight vector and feeds it through the existing integrated comparator;
- strict allocation filters by round availability before strict matching, while the resulting matching remains compatible with the allocation conversion path;
- `strictMatching([], ...)` now returns the declared `number[][]` shape (`[]`) rather than an object;
- compiled two-team `vote_rate` correctly maps accumulated signed ballot margin from `[-acc, +acc]` onto support rate `[0,1]` for valid win/tie inputs, consistent with round-level vote-rate semantics;
- no PR-introduced regression was found in surrounding allocation/result logic.

Regression/CI verification from workflow run `35415799261`:
- lint job: success (`pnpm lint`, `pnpm lint:web`);
- core: 23 files / 108 tests passed, including `allocations-options.test.ts`, `allocations-teams-strict.test.ts`, and `results-summarize.test.ts`;
- server: 12 files / 143 tests passed;
- web: 66 files / 329 tests passed;
- production build/typecheck: success.

Out-of-scope boundary observation for a later phase:
- the raw-team-result API currently accepts `win: z.number()` without a [0,1] bound. The #34 core formula assumes valid two-team win/tie points; malformed raw values could violate the intended vote-rate range as well as win-point semantics. This is not introduced by #34 and should not be patched into this core PR; re-check it when auditing boundary validation (#40) or during the cross-PR regression sweep.

### Next Phase 3 unit

Audit independent PR #35 only: refresh its head/base, inspect changed-code neighborhoods, verify its regression coverage/CI, fix only #35-scoped issues, then checkpoint.
