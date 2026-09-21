# Phase 11 audit — release residuals and merge readiness

Date: 2026-09-21
Branch: `audit/release-residuals-phase11-20260921`
Base: `audit/cumulative-e2e-phase10-20260921`

## Decision scope

This phase does not add new product behavior. It classifies remaining findings into:

1. release blockers that must be fixed before the merge train,
2. acceptable architectural/operational residuals,
3. product decisions that should not be resolved by inventing undocumented limits.

The release decision here is **readiness to enter Phase 12 merge train**, not a claim that production has transaction-level atomicity.

## Release blockers found in Phase 11

### PR #37 current-head CI failure

The latest tournament-membership branch serialized tournament creation with the tournament lifecycle lease, but the unit test still used the real lease service and assumed the old post-create tournament id.

Effect:
- test waited for Mongoose buffering and failed,
- source PR head was red even though the cumulative branch had previously been green.

Fix:
- mock lifecycle lease acquire/release in the unit test,
- derive the rollback tournament id from the `TournamentModel.create` payload instead of a stale hard-coded id.

Source branch fix:
- `audit/auth-public-boundaries-phase6`
- commit `7ec1333c712b72f3c3df1e0361f29fa32bba99de`

### PR #39 current-head CI failure

The recent-regressions branch imported `tournament-membership-guard.service.js` from import/copy lifecycle code but did not contain that service, so TypeScript compilation failed when #39 was tested directly against `main`.

Fix:
- add the same membership guard implementation used by #37 so #39 is self-contained.
- after #37 merges first, GitHub should naturally drop the identical file from #39's effective diff.

Source branch fixes:
- `audit/recent-pr-regressions-phase8`
- add the missing guard service,
- mock lifecycle leases in isolated controller tests,
- pin the target tournament id in the copy rollback test,
- current repaired head: `cb1ce63e5bd9330301ad367c176911ff4a21b748`

### Cumulative stack was missing the latest #37 tournament-create lease

The Phase 10 cumulative branch contained the membership guard and delete-side lifecycle serialization, but did not yet include the newest #37 create-side lifecycle lease.

Fix on this Phase 11 branch:
- preallocate the tournament ObjectId,
- acquire the tournament lifecycle lease before creating the tournament,
- keep the lease through organizer membership attachment/rollback,
- release it before returning,
- synchronize the corrected regression test.

This closes the integration gap before Phase 12.

### Cumulative stack was also missing the latest #39 import/copy lifecycle lease

The Phase 10 cumulative branch contained the earlier #39 rollback and ballot/export fixes, but not the later source-branch change that preallocates the target tournament id and holds the tournament lifecycle lease across import/copy plus organizer membership attachment.

Fix on this Phase 11 branch:
- import preallocates the target tournament id and holds the lifecycle lease through restore, membership attachment, rollback, and release,
- devtools copy preallocates the target id before copying and holds the same lifecycle lease through organizer membership attachment,
- copy service accepts that preallocated id while retaining the Phase 9 boundary validation,
- isolated rollback tests use mocked leases and deterministic target ids.

This is the only additional source-branch update after the Phase 8 integration cutoff besides #37; the other source PR heads predate the final Phase 8 integration head.

## Acceptable residual risks

### R1 — multi-collection round lifecycle atomicity

Round renumber/delete can mutate Round, Draw, Submission, Result, raw results, entity details, and stored round references.

Current protections:
- topology/entity mutation leases,
- optimistic versions where needed,
- idempotent retry for ordinary transient single-write failure,
- cumulative lifecycle tests.

Residual:
- process termination,
- persistent DB failure,
- or connection loss during a multi-collection mutation can still leave partial state.

The bundled `docker-compose.vps.yml` uses standalone MongoDB, so this is relevant to the documented self-host path.

Disposition:
- **not treated as a Phase 11 code blocker**, because eliminating it requires a deliberate transaction/recovery architecture change rather than another local retry.
- deployment documentation now states this limitation explicitly.
- full atomicity requires both a transaction-capable MongoDB topology and server lifecycle code implemented with transactions (or a durable application recovery journal).

### R2 — five-minute lease staleness without heartbeat

Entity and membership mutation leases use a five-minute stale timeout and do not refresh the lease while a mutation is running.

Residual:
- an abnormally long operation exceeding the stale interval could allow another request to treat the lease as stale.

Disposition:
- acceptable for the expected tournament sizes covered by current tests,
- should be revisited if very large tournaments/imports become a supported target.
- not independently changed in Phase 11 because heartbeat semantics would broaden the concurrency design.

## Product decisions, not inferred bug fixes

### P1 — no maximum for `total_round_num`

Server/model validation requires positive integers but intentionally has no product-defined maximum.

Concrete consequence:
- when no Round documents exist, `AdminTournamentHome.vue` builds `managedRoundNumbers` with
  `Array.from({ length: Math.floor(total) })`.
- an organizer-supplied extreme value can therefore cause excessive allocation or an admin-page failure.

Scope:
- tournament create/update is organizer/admin controlled rather than anonymous input.
- once actual rounds exist, the UI prefers the stored round list.

Disposition:
- **product decision**, not a release blocker.
- do not invent an arbitrary maximum during an audit.
- if a supported maximum tournament length is defined later, enforce the same bound in route validation, model validation, import/copy validation, OpenAPI, and web inputs.

### P2 — no relational rule requiring `current_round_num <= total_round_num`

Both fields are positive integers, but the model does not define a relational constraint.

Disposition:
- leave unchanged until semantics are explicitly specified; current round metadata and actual Round documents are not strictly identical concepts.

## Merge-order constraints for Phase 12

The intended source merge order remains:

1. #34
2. #35
3. #36
4. #37
5. #38
6. #39
7. #40
8. retarget/reconcile #41 onto the resulting `main`, verify effective diff and exact-head CI, then merge
9. reconcile Phase 9 delta (#42) onto the new `main`
10. reconcile Phase 10 delta (#43) after #42
11. reconcile this Phase 11 delta after #43

For every retarget/reconciliation:
- inspect the effective diff, not only ancestry,
- run lint + web lint + full tests + build,
- run focused lifecycle/concurrency tests,
- do not merge a red or stale head.

## Phase 11 release assessment

Provided the corrected source heads (#37 and #39) and this cumulative Phase 11 head are green, there is no remaining identified **code blocker** to starting Phase 12.

Production release still retains R1/R2 and the explicit P1/P2 product decisions above.
