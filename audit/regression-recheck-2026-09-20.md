# UTab regression re-audit — 2026-09-20

This log records the second-pass regression audit of open audit PRs #34-#41.
Application code must not be changed during Phases 0-1.

## Phase 0 — frozen baseline

Baseline main:
- `main`: `6438f0b3b9586a96fe40e2ea887950bee34c3571`

Frozen PR heads:
- #34 `1b78cea2174bc94fe11ff372c96256f1233f2cbd` -> `main`
- #35 `130d0fa346bd93218a684b88b493b1f356ac557d` -> `main`
- #36 `eef5d1264b613ac8cb07cf13fee6fd44c30551fa` -> `main`
- #37 `6d164672cbb87e34413c9cd6088eeffebb912a15` -> `main`
- #38 `352ba0c63613b0190a58034d270a14576a61554a` -> `main`
- #39 `8ded872fdc935eb2e3fbef8f47b9867c4ad73816` -> `main`
- #40 `83d17e1dd1c945c7e2c7be2d4133945f5bed3139` -> `main`
- #41 `d3316605af94b6b9bed3c4309eb5b05f8596525a` -> #40

At the frozen baseline all eight PR heads are mergeable/clean against their declared bases and their exact-head CI runs pass.

#41 is a real stack on current #40: the #40 head is the merge base and #41 is 0 commits behind it. The effective #41-vs-#40 delta is seven files.

Important overlap hotspots:
- `packages/server/test/integration.part4.test.ts`: #36/#37/#38/#40
- `packages/server/src/controllers/rounds.ts`: #36/#40/#41
- `packages/server/test/integration.part2.test.ts`: #35/#40/#41
- `packages/server/test/integration.part3.test.ts`: #35/#40/#41
- `packages/core/src/results/results.ts`: #34/#35
- `packages/server/src/controllers/tournament-import.ts`: #39/#40
- `packages/server/src/devtools/copy-tournament.service.ts`: #39/#40
- `packages/server/src/routes/tournaments.ts`: #38/#40
- participant ballot view/tests: #38/#39
- allocation UI/tests: #38/#41

Environment discrepancy to revisit in Phase 10:
- GitHub CI: Node 20.11.0
- Docker server/web build: Node 24
- Docker MongoDB: 8.0

## Phase 1 — behavior contracts

The following contracts are intentionally stated independently of implementation. Later phases must check that both each source PR and the final composed tree preserve them.

### C34 — core allocation and vote-rate invariants

Must hold:
1. Weighted allocation must use a fully initialized weight vector; configured filters must be able to distinguish candidates rather than collapse to ties because of sparse-array behavior.
2. Strict allocation must apply round availability before matching.
3. Strict allocation with no eligible teams must return an empty matching rather than fail or manufacture entries.
4. In two-team compiled results, `vote_rate` is a support proportion on the [0,1] scale, not a signed margin. Ties/fractional outcomes must remain valid on that scale.

Must not regress:
- availability filtering must not be bypassed merely because allocation method is `strict`;
- unanimous loss must never become a negative `vote_rate`.

Evidence anchors:
- #34 tests: weighted filter differentiation, strict unavailable-team exclusion, empty strict matching;
- #34/#40 result tests cover two-team support-rate behavior including fractional values.

### C35 — compiled-result determinism, revisions, and completeness

Must hold:
1. Requested compile rounds have set semantics: duplicate/reordered round selectors do not change compiled results.
2. Compile preview `revision` is content-sensitive: mutating result content at fixed cardinality invalidates the previous revision.
3. Submission-source compilation must detect an expected draw matchup with no required ballot submission.
4. Missing data must obey `missing_data_policy` rather than silently disappearing.
5. Equivalent valid submission/raw inputs should agree on compiled team/speaker metrics.
6. Required ballot submitters and required feedback are evaluated only in the relevant configured/requested scope.
7. Team-template speaker fallback remains available when round-specific speaker details are absent.

Must not regress:
- revision must not be a count-only fingerprint;
- duplicate round selectors must not double-count;
- a draw row with missing required submission data must not vanish silently.

Explicit scope note:
- #35 itself does not establish identical Draw-completeness enforcement for `source='raw'`. This is a later audit target, not permission to weaken submission-source completeness.

### C36 — lost-update protection for Draws and Submissions

Must hold:
1. Concurrent admin edits to the same Submission from the same observed version cannot both silently succeed.
2. Round renumbering invalidates an in-flight stale Submission edit by advancing Submission `__v`.
3. Concurrent Draw updates from the same observed version cannot both silently win.
4. Draw partial updates preserve existing `drawOpened`, `allocationOpened`, and `locked` when those fields are omitted.
5. Explicit updates to those fields, including explicit unlock, still take effect.

Must not regress:
- omission is not equivalent to `false`;
- round migration must not leave the old Submission version usable by a stale writer.

Residual architecture contract:
- because standalone Mongo is used, multi-collection round migration is not assumed atomic. Later failure-injection auditing must characterize/contain partial-failure behavior rather than pretending a transaction exists.

### C37 — tournament membership privacy and hidden-tournament semantics

Must hold:
1. Tournament-admin membership-management responses may expose only the membership information relevant to the tournament being administered.
2. A managed user's unrelated tournament memberships must not be disclosed.
3. The user's own `/auth/me` may still expose their own complete membership list.
4. `user_defined_data.hidden=true` is a listing-visibility setting: hidden tournaments are omitted from public listings.
5. Hidden status alone must not create a new admin-only/direct-access authorization boundary; direct access follows the ordinary public/password/membership policy.
6. Membership add/remove mutations are serialized by the membership lease.
7. Remove rollback decisions must use state refreshed after lease acquisition, not a stale pre-lease User snapshot.

Must not regress:
- do not restore the earlier rejected behavior that returned 404/admin-only solely because `hidden=true`;
- failed rollback must not resurrect a membership link that was already absent when the lease was acquired.

### C38 — web tournament-scope isolation and atomic metadata patches

Must hold:
1. Tournament-scoped stores must not display tournament A data while tournament B is the active/loading scope.
2. Switching tournament scope clears stale visible state immediately where applicable.
3. Late responses from an inactive tournament cannot overwrite active-tournament data.
4. Late errors from an inactive tournament cannot replace the active tournament's error state.
5. Same-tournament mutations invalidate only the appropriate same-tournament reads.
6. A mutation belonging to A cannot invalidate/contaminate an in-flight/current B request.
7. Mutation-only first use retains intended compatibility behavior while claiming the correct tournament scope.
8. Multi-step UI actions are pinned to the route/tournament context where they started; late completion after context change is ignored.
9. Independent tournament metadata edits use validated `user_defined_data_patch` semantics, not stale full-object replacement.
10. Server-side independent patches preserve each other and unrelated keys.
11. Client-side handling of patch responses is intent-aware: out-of-order full responses cannot revert unrelated metadata committed by another independent patch.

Must not regress:
- do not fix only server atomicity while allowing last-response-wins stale client state;
- unsafe patch keys / simultaneous full-object plus patch updates remain rejected.

### C39 — recent-PR regression fixes

Must hold:
1. Ballot wizard navigation tracks furthest reached progress separately from the currently selected step.
2. Revisiting an earlier step must not disable already reached later steps.
3. When dynamic steps/context change, current and furthest progress are clamped/reset consistently.
4. Tournament import/copy rollback must wait for relevant membership writes to settle before cleanup.
5. Cleanup failures must be surfaced together with the original failure rather than discarded.
6. When cleanup succeeds, the original structured import error must remain intact.
7. Detailed result export sorts `speaker_order` numerically, including orders >=10.

Must not regress:
- rollback must not use fire-and-forget membership writes;
- `Promise.allSettled` failures must not be silently ignored;
- export ordering must not use lexicographic string order for numeric speaker slots.

Inherited behavior that must survive composition:
- configurable ballot submitter roles remain enforced server-side;
- participant task identifiers remain validated against the relevant draw/configuration.

### C40 — boundary/type integrity and entity namespace serialization

Must hold:
1. Raw-result round query parameters are parsed/validated as positive integers.
2. Tournament `total_round_num` and `current_round_num` are positive integers at public request boundaries, persistence validation, and backup import.
3. Round-scoped persisted fields (`round`/`r`) are positive integers on validated write/import paths.
4. `tie_points` is bounded to [0,1].
5. Team/adjudicator/venue templates and details use structured validation; known field types are checked.
6. Entity detail rounds are positive integers and duplicate detail rounds are rejected.
7. Create/update/bulk/allocation/import paths enforce compatible entity-detail invariants.
8. Entity CRUD and round detail synchronization use the same tournament/entity namespace serialization so concurrent writers cannot silently lose detail changes.
9. Raw team-result `win` is finite and bounded to [0,1] at request, model persistence, and backup-import boundaries.
10. Legitimate fractional `win` values such as 0.5 remain accepted.

Must not regress:
- import/native insertion must not bypass the invariant merely because normal route validation is skipped;
- namespace acquisition order must not introduce inconsistent lock ordering.

Explicit non-contract:
- no arbitrary maximum for `total_round_num` is introduced until a product limit is specified. Resource-exhaustion implications remain a later review item.

### C41 — authoritative publication state and PDA draw editing

Must hold:
1. `Draw.drawOpened` / `Draw.allocationOpened` are the authoritative publication state.
2. New Round compatibility publication fields default closed.
3. Public Round list/get responses derive `teamAllocationOpened` / `adjudicatorAllocationOpened` from the matching Draw.
4. If no matching Draw exists, a Round cannot advertise a publication/allocation that does not exist.
5. Legacy/admin Round publication fields do not override authoritative Draw state in participant/public DTOs.
6. No bidirectional Draw<->Round persistence mirroring is introduced merely to synchronize these compatibility fields.
7. An entity already assigned in the persisted Draw may be moved or removed after becoming unavailable.
8. An unavailable entity that was not already assigned may not be newly introduced.
9. Duplicate-assignment validation remains active independently of the unavailable-assigned exception.
10. PDA configurable submitter-role, scoreless-ballot, and no-draw settings continue to work through the lifecycle.
11. Full lifecycle operations preserve their dependent state across publication, ballots/feedback, compile preview/save, break, renumber, export/import, and deletion.

Composition requirements:
- #41 must preserve C36 Draw partial-update semantics and Submission renumber invalidation.
- #41 allocation UI must preserve C38 route-context/request-gate protections.
- #41 must contain C40 raw-team `win` boundary behavior.
- #40 must be merged/reconciled before #41; after retargeting #41 to updated `main`, these contracts must be rechecked on the new exact head.

Must not regress:
- do not reintroduce non-atomic dual writes between Round and Draw publication state;
- the unavailable-assigned exception must not turn into permission to add arbitrary unavailable entities.

## Cross-PR invariants for the final composed tree

These are the highest-value composition checks for later phases:

1. **Single-source publication:** C36 omission-preserving Draw updates + C41 Draw-authoritative publication must compose without stale Round compatibility fields becoming authoritative.
2. **Round migration safety:** C36 Submission CAS invalidation + C40 entity namespace leases + C41 lifecycle renumber behavior must coexist.
3. **Web allocation context:** C38 request/route guards must survive #41 allocation UI changes.
4. **Metadata write monotonicity:** C38 server atomic patch and client intent-merge must survive C40 tournament-route validation changes.
5. **Import/copy safety:** C39 rollback reporting/waiting must survive C40 import validation/runtime-collection changes.
6. **Result semantics:** C34 [0,1] support-rate semantics and C35 set/deterministic compilation must compose.
7. **Boundary defense in depth:** C40 request/model/import checks must remain mutually consistent rather than only passing one entry path.
8. **Test-union rule:** merge conflicts in shared integration test files are resolved by retaining independent regression coverage from every PR, never by selecting one side wholesale.

## Phase 1 result

No application-code change is warranted in Phase 1.

The behavior contract is now frozen for subsequent semantic-diff, test-quality, composition, race, boundary, web-state, lifecycle, failure-injection, and merge-rehearsal phases.

Any later change that makes CI green but violates one of the contracts above is a regression, not an acceptable conflict resolution.


## Phase 2 — semantic-diff audit and targeted repairs

Scope:
- re-read the implementation deltas of #34-#41 against contracts C34-C41;
- followed changed behavior across route/controller/model/import/export and web store/UI consumers where applicable;
- reverse-searched production writers for state protected by the new concurrency contracts rather than assuming changed-file lists were complete.

### P2-001 — #38 inactive tournament mutations could erase the active tournament error

Severity: regression / state-isolation violation.

Finding:
- Draw, Compiled, and Submission mutation methods correctly suppressed inactive-tournament result/error writes after request completion;
- however, several mutation methods still executed `error.value = null` unconditionally when an inactive-tournament request started;
- `deleteCompiled` could additionally replace the active tournament error with `Invalid compiled result id` for an inactive tournament;
- therefore tournament A activity could mutate tournament B's visible error state even though A could no longer mutate B's data.

Repair on #38:
- mutation-start error clearing is now gated by `tournamentScope.isActive(tournamentId)`;
- the invalid compiled-id early-return error is also active-scope-only;
- focused regression tests cover Draw, Compiled, and Submission stores.

#38 head after repair:
- `cc3f1db1e918319d118395d0ea3ce31a78219ba3`

Changed from frozen #38 head only in:
- `packages/web/src/stores/draws.ts` + test;
- `packages/web/src/stores/compiled.ts` + test;
- `packages/web/src/stores/submissions.ts` + test.

Exact-head CI:
- push run `35539634310`: passed;
- pull-request run `35539687295`: passed.

### P2-002 — #41 Draw availability validation had a TOCTOU race with entity mutation

Severity: concurrency correctness violation.

Finding:
- #41 permits an entity already assigned in the persisted Draw to be moved/removed after becoming unavailable while rejecting newly introduced unavailable entities;
- `upsertDraw` read Team/Adjudicator/Venue availability and only later wrote the Draw;
- entity CRUD in #40 is namespace-serialized, but Draw validation did not participate in those namespaces;
- an entity could therefore be read as available, become unavailable concurrently, and then be newly persisted into the Draw from the stale validation snapshot.

Repair on #41:
- Draw upsert acquires the adjudicator/team/venue namespace leases before entity reads;
- saved Draw generation (`generateDraw(save=true)`) participates in the same namespaces, holding a stable entity snapshot through allocation generation and persistence;
- preview-only generation (`save=false`) remains non-mutating and does not take the write-serialization lease;
- leases are held through structure/reference/availability validation, existing-Draw inspection, and the optimistic Draw save;
- acquisition follows a fixed namespace order and partial acquisition is released on failure;
- a held entity namespace now makes both direct Draw mutation and saved Draw generation return 409 rather than persisting from unstable entity state;
- integration coverage holds the Team namespace and verifies both write paths are rejected until release.

#41 Phase-2 repair commits:
- direct upsert implementation: `e66d332bf690c1e97ac2d5370cacbd4f1741bc70`;
- direct upsert regression test: `738311259956b670533fad2726de300133335f49`;
- saved generation implementation: `96cbe1ec91e9c19116dc83100d7f16d49e5e1124`;
- saved generation regression test: `21ab899aa56c131bcedff9495600872b2ee3b81c`.

### P2-003 — #40 privacy erasure bypassed entity namespaces and Draw optimistic-lock invalidation

Severity: lost-update / stale-write correctness violation.

Finding:
- reverse-searching writers outside the ordinary entity CRUD controllers found `privacy.ts`;
- speaker hard deletion performs a Team read-modify-write to remove speaker references from Team template/details;
- adjudicator erasure directly mutates Adjudicators and hard deletion rewrites Draw allocations;
- these writes did not join the #40 entity namespace scheme;
- the Draw rewrite also did not increment Draw `__v`, so a writer that had observed the old Draw version could still pass an optimistic CAS after privacy cleanup and potentially restore the removed adjudicator reference.

Repair on #40:
- privacy erasure now acquires the relevant entity namespaces:
  - speaker anonymization: speakers;
  - speaker hard-delete: speakers + teams;
  - adjudicator erase: adjudicators;
- hard-delete Draw allocation cleanup increments Draw `__v`;
- direct privacy endpoints map namespace contention to retryable HTTP 409;
- erasure-request execution recognizes the same retryable conflict and restores `running -> approved` instead of permanently marking the request `failed`;
- regression coverage verifies:
  - a held Team namespace blocks speaker hard-delete;
  - adjudicator hard-delete advances Draw `__v`;
  - namespace-blocked erasure-request execution returns to approved state and returns 409.

#40 head after repair:
- `3ec3fbc04814c87855222dac4890ef33d6690016`

Files added to the frozen #40 delta:
- `packages/server/src/controllers/privacy.ts`;
- `packages/server/src/controllers/erasure-requests.ts`;
- `packages/server/test/erasure-requests.controller.test.ts`;
- `packages/server/test/integration.part1.test.ts`.

### #40 -> #41 stack reconciliation

After P2-003, #41 was reconciled with the new #40 head using a true two-parent merge commit:
- parent 1: #41 repaired head `738311259956b670533fad2726de300133335f49`;
- parent 2: #40 head `3ec3fbc04814c87855222dac4890ef33d6690016`;
- merge: `a143a022123e6e61f88b96b545f9d0d470979d73`.

After the saved-generation follow-up, current #41 head is:
- `21ab899aa56c131bcedff9495600872b2ee3b81c`.

Direct comparison confirms:
- #41 is 0 commits behind current #40;
- effective #41-vs-#40 behavior remains confined to the same seven Phase-10 files:
  Draw publication/PDA validation, Round publication derivation/defaults, lifecycle tests, and allocation UI/tests.

### PRs re-read without a new high-confidence semantic defect in Phase 2

- #34: weighted/strict allocation and two-team support-rate implementation remains consistent with C34.
- #35: set semantics for rounds, content-sensitive revision, and submission-source completeness logic remain consistent with C35.
- #36: Draw omission preservation, Draw CAS, Submission CAS, and renumber version invalidation remain consistent with C36.
- #37: hidden-as-listing-only semantics, membership response scoping, lease serialization, and post-lease refresh remain consistent with C37.
- #39: wizard furthest-progress state, rollback error surfacing/waiting, and numeric speaker export order remain consistent with C39.
- #40 boundary/model/import changes outside P2-003 remain semantically consistent with C40 on this pass.
- #41 Draw-authoritative public publication and unavailable-assigned exception remain semantically consistent with C41 after P2-002.

### Deferred checks, not accepted as safe by assumption

The following are deliberately left to their planned dedicated phases:
- Phase 3: prove regression tests fail against the corresponding pre-fix behavior where practical;
- Phase 4: compose all independent PRs, especially #38/#40/#41 and shared test-file unions;
- Phase 5: deterministic interleavings for namespace/CAS/lease behavior;
- Phase 6: request/model/import boundary matrix and Mongoose query-update validation;
- Phase 7: exhaustive web async-state adversarial cases, including loading-state semantics;
- Phase 9: lease-release/rollback/multi-write failure injection.

Phase 2 does not treat ordinary CI success as proof of these deferred properties.


## Phase 2-1 — #38 semantic re-audit: web tournament-scope isolation

Audit target:
- PR #38 `audit/web-state-sync-phase7`;
- frozen Phase-0 head was `352ba0c63613b0190a58034d270a14576a61554a`;
- before this subphase started, #38 had independently advanced by six commits to `cc3f1db1e918319d118395d0ea3ce31a78219ba3`;
- that intermediate delta was reviewed first rather than silently replacing the frozen baseline. It only changed Draw/Compiled/Submission store error-scope behavior and their tests, and both exact-head CI runs were green.

Semantic coverage in this subphase:
- server tournament metadata PATCH schema/controller;
- client `tournamentStore.updateTournament` intent-merge behavior;
- `createTournamentStoreScope` and all entity stores;
- Draw/Round/Result/Compiled/Submission/RawResult stores;
- admin setup/rounds/compiled/submissions/allocation/result consumers;
- participant ballot/feedback late-completion guards.

### P2-1-001 — submission timeout bypassed tournament error scoping

Finding:
- ordinary ballot/feedback failures were scoped with `tournamentScope.isActive(tournamentId)`;
- timeout cancellation was handled inside `postWithTimeout`, which wrote `error.value` directly;
- a tournament-A submission could therefore time out after the UI switched to tournament B and overwrite B's visible Submission error.

Repair:
- `postWithTimeout` now receives the originating tournament id;
- timeout errors are written only while that tournament is the active Submission scope;
- regression coverage starts a ballot in A, activates B with its own error, then resolves the A request as canceled and verifies B's error survives.

### P2-1-002 — tournamentStore could publish stale autosave errors after route switch

Finding:
- `tournamentStore` is global rather than tournament-scoped;
- admin pages include `tournamentStore.error` in their visible load/save errors;
- a late tournament-A autosave failure could set the global error after a newer B refresh had become authoritative, even though the caller itself returned on route-context mismatch.

Repair:
- tournament-store operations now receive a monotonically increasing operation token;
- only the latest-started operation may publish a global store error;
- a newer tournament-list refresh therefore invalidates the error side effect of an older update;
- existing list-state sequencing remains separate and unchanged.

Additional validation:
- added a behavioral test for concurrent independent `user_defined_data_patch` responses arriving in reverse order;
- the final local tournament state preserves both intents and unrelated metadata.

### P2-1-003 — raw-result edit/create/delete UI retained stale route context

Finding:
- `AdminRoundResult.vue` rebuilt the default raw JSON on label/round changes but not on tournament changes;
- A -> B with the same round could therefore leave `newPayload.tournamentId=A`;
- edit state and the delete-all modal also survived tournament/round changes;
- switching the raw-result label while editing could leave an id/payload from the previous collection under the new label.

Repair:
- changing label now cancels edit state, closes delete-all state, and rebuilds the default payload;
- changing tournament or round does the same before refreshing;
- default raw JSON therefore follows the current tournament/round and stale multi-step actions are discarded.

### P2-1-004 — raw-result mutations did not invalidate same-scope stale fetches

Finding:
- RawResult fetches had per-label request sequencing and cross-tournament scope checks;
- unlike the other mutated stores, successful same-tournament RawResult mutations did not advance the label sequence;
- an older fetch could therefore write a pre-mutation snapshot before the caller's follow-up refresh completed.

Repair:
- successful create/update/delete/bulk-delete invalidates the affected label fetch only when the mutation belongs to the active tournament;
- inactive-tournament mutations do not invalidate a current tournament fetch;
- regression coverage verifies an older same-tournament team-result fetch is discarded after an update.

### Phase 2-1 result

Current #38 head:
- `9664dc92ad97c06fc48a4c1229d91d566f320c81`

Relative to the pre-subphase head `cc3f1db1...`, the repair is confined to:
- `packages/web/src/stores/submissions.ts` + tests;
- `packages/web/src/stores/tournament.ts` + tests;
- `packages/web/src/stores/raw-results.ts` + tests;
- `packages/web/src/views/admin/round/AdminRoundResult.vue`;
- `packages/web/src/views/admin/__tests__/AdminRefreshGates.test.ts`.

Exact-head validation:
- push CI run `35541523005`: passed lint, web typecheck, full tests, and production build;
- pull-request CI run `35541526816`: passed on the same exact head;
- GitHub reports #38 mergeable against its current base.

No further high-confidence C38 semantic defect was found in this subphase.

Deferred rather than assumed safe:
- Phase 3 will assess whether source-text UI tests adequately prove runtime behavior;
- Phase 4 must re-compose these #38 fixes with #40/#41, especially the allocation UI overlap;
- Phase 7 remains responsible for broader adversarial loading/error semantics across every route transition.


## Phase 2-2 — #36/#37 semantic re-audit: CAS writers and membership authority

Audit targets:
- #36 `audit/server-state-races-phase5`, frozen head `eef5d1264b613ac8cb07cf13fee6fd44c30551fa`;
- #37 `audit/auth-public-boundaries-phase6`, frozen head `6d164672cbb87e34413c9cd6088eeffebb912a15`.

The audit followed all runtime writers of Submission/Draw versioned state and all request-time writers of tournament membership state rather than limiting review to the files originally changed by the PRs.

### P2-2-001 — privacy erasure could be undone by a stale Submission admin edit

Severity: privacy / lost-update correctness violation.

Finding:
- #36 protects admin Submission edits with optimistic `__v` CAS;
- round renumbering correctly increments Submission `__v`;
- privacy erasure cleared `payload.comment` through `SubmissionModel.updateMany` without incrementing `__v`;
- an admin edit that had read the old version could therefore pass its later CAS and restore a comment after personal-data erasure.

Repair on #36:
- speaker/adjudicator privacy comment erasure increments Submission `__v`;
- only submissions where `payload.comment` actually exists are updated, preserving the original meaning of `submissionCommentsCleared`;
- deterministic integration coverage pauses a stale admin edit, performs privacy erasure, then verifies the edit returns 409 and the erased comment stays absent;
- the same test includes a matching no-comment Submission and verifies the cleared-comment count remains exactly 1.

### P2-2-002 — adjudicator privacy cleanup bypassed Draw CAS on #36

Severity: stale-write correctness violation.

Finding:
- adjudicator hard-delete rewrites persisted Draw allocations to remove adjudicator references;
- on #36 that bulk rewrite did not advance Draw `__v`;
- a Draw writer that observed the pre-erasure version could therefore still pass optimistic CAS and restore the removed adjudicator reference.

Repair on #36:
- privacy-driven Draw allocation rewrites increment Draw `__v`;
- regression coverage verifies hard-delete advances the stored Draw version and removes the adjudicator.

Note:
- this same Draw-version issue had independently been found and repaired on #40 during P2-003. Phase 2-2 restores the invariant to the source #36 PR as well, so the PR is safe standalone and later conflict resolution has an explicit test to preserve.

Current #36 head:
- `8b6afcf7f68bcd41cd0a4d9f8482b04d83c11d09`.

Exact-head validation:
- PR CI `35542694969`: passed lint, full tests, and production build;
- GitHub reports #36 mergeable.

### P2-2-003 — auth legacy-membership backfill could resurrect a removed membership

Severity: authorization / membership-race violation.

Finding:
- #37 serializes explicit tournament-user add/remove with a per-(tournament, username) membership lease;
- login and `/auth/me` also mutate `TournamentMemberModel` through legacy membership backfill, but originally bypassed that lease;
- both endpoints started from a previously read `User.tournaments` snapshot;
- a remove could therefore complete while login still held the old User snapshot, after which auth backfill could recreate the removed membership;
- auth responses also unioned the legacy User list back into the returned membership list, allowing response/session state to disagree transiently with the central membership table used by authorization middleware.

Repair on #37:
- legacy backfill acquires the same membership lease as explicit add/remove;
- after lease acquisition it re-reads the current User role/tournament list and only backfills membership that is still present;
- creator-membership backfill now also participates in the membership lease;
- legacy and creator backfills run sequentially, avoiding overlapping upserts for the same membership;
- after backfill, login and `/auth/me` return the central `TournamentMemberModel` summary only; the legacy array is migration input, not a second authorization source.

Regression coverage:
- pauses login after its initial User read, removes the membership, then resumes login and verifies the membership is not resurrected or returned;
- holds the membership lease around a legacy-only membership and verifies auth does not expose it while the central mutation is unresolved;
- after lease release, a retry login successfully backfills and returns the membership, proving the safety rule does not permanently discard legacy migration.

Current #37 head:
- `26e2d7d7dc2de03217f0cf03fd37c0167509057a`.

Exact-head validation:
- push CI `35542786664`: passed lint, full tests, and production build;
- PR CI `35542790104`: passed on the same exact head;
- GitHub reports #37 mergeable.

### P2-2-004 — carry Submission privacy CAS through #40/#41

Because #40 and #41 also modify `privacy.ts`, leaving the #36 repair only on its source branch would make it easy to lose during later conflict resolution.

Propagation:
- #40 now carries the Submission `__v` increment and comment-exists filter;
- #40 current head: `768dd7b0a05f8626e01c31cf6876da74cce441e7`;
- exact-head push CI `35542651336` and PR CI `35542654941` passed;
- #41 carries the same invariant and was reconciled with current #40 using a two-parent merge;
- #41 current head: `fe5d9776c381e5d7d6dd45b2be14c33d1fc21696`;
- direct compare confirms #41 is 0 commits behind #40 and its effective delta remains the original seven lifecycle/allocation files;
- exact-head PR CI `35542677688` passed lint, full tests, and production build.

### Additional writer audit

No additional #36 runtime Draw mutation was found in the dev-tools round-submission filler: it reads Draw allocation and bulk-writes Submission inserts only.

A separate cross-lifecycle race remains deliberately deferred:
- `deleteTournament` can race with tournament-user add/remove across the whole tournament;
- solving this correctly requires a tournament-level lifecycle/membership serialization design rather than extending a per-user lease ad hoc;
- this is explicitly assigned to Phase 5 deterministic interleaving audit.

Creator membership remains a migration/ownership invariant: creator backfill is now lease-serialized, but whether a tournament creator should ever be permanently removable is a product-semantic question and is not changed in Phase 2-2.

### Phase 2-2 result

The source PRs now preserve their own stated concurrency contracts rather than relying on later #40 fixes:
- Submission privacy erasure invalidates stale edits;
- Draw privacy cleanup invalidates stale Draw writers;
- request-time membership backfills use the same serialization authority as membership administration;
- auth membership responses use the same central membership source as authorization middleware.

No additional high-confidence C36/C37 semantic defect was found after the writer reverse-search. The tournament-deletion cross-race is not accepted as safe; it is carried forward to Phase 5.


## Phase 2-3 — #35/#34/#39 semantic re-audit

Audit targets:
- #35 compiled-results invariants;
- #34 core allocation/result invariants;
- #39 recent-regression repairs.

### P2-3-001 — #35 raw-source Draw completeness was still only a documented scope gap

Finding:
- #35 enforced Draw-matchup completeness for `source='submissions'`;
- the corresponding raw-source path could still silently compile a selected Draw while omitting a matchup that had no raw team-result rows;
- leaving this only on a later cumulative branch was unsafe for the planned merge sequence because #35 itself targets `main`.

Repair on #35:
- raw compilation now validates selected Draw matchups against raw team-result groups;
- a completely absent matchup is routed through `missing_data_policy`;
- a partially present matchup reports the missing team row;
- warn mode keeps Draw teams in the compiled team universe so missing matchups do not silently disappear;
- raw completeness validation is scoped through `validationLabels` and runs only when team results are being validated, preventing adjudicator-only/speaker-only subset compilation from being blocked by unrelated raw team gaps.

Regression coverage:
- error mode rejects a selected Draw with an entirely missing raw matchup;
- warn mode emits a warning and retains all Draw teams;
- adjudicator-only raw compilation remains allowed under the same missing team condition.

Current #35 head:
- `553fa30fd1354e708bdc05f94b9ba778845e1b8c`.

Exact-head CI:
- push `35543503073`: success;
- PR `35543505628`: success.

### P2-3-002 — #34 compiled vote_rate preserved the wrong null semantics outside ordinary 2-team observations

Finding:
- #34 corrected the signed-margin bug by mapping two-team vote margin back to a support rate;
- however the compiled result type still required `number`;
- non-two-team formats and teams with no selected-round ballot observations therefore collapsed to numeric `0`, even though round-level `vote_rate` is nullable and there is no meaningful support-rate observation in those cases.

Repair on #34:
- compiled `vote_rate` now aggregates the actual round-level `vote_rate` observations, weighted by their ballot count;
- rounds whose `vote_rate` is `null` contribute nothing;
- if no vote-rate observation exists, the compiled field remains `null`;
- `CompiledTeamResult.vote_rate` is typed `number | null`.

Regression coverage:
- four-team result compilation preserves `vote_rate=null`;
- a two-team entity with no selected-round ballots preserves `vote_rate=null`;
- ordinary two-team multi-round support-rate aggregation remains 0..1.

Current #34 head:
- `40b2017afc93967f94e961919ebad37fd0814c75`.

Exact-head CI:
- push `35543423406`: success;
- PR `35543425350`: success.

### #39 semantic re-read

The three repaired behaviors were traced again:
- ballot wizard remembers furthest reached step independently from the active step;
- import/copy cleanup waits for all cleanup attempts and surfaces cleanup failures with the original failure;
- detailed-result `speaker_order` sorting is numeric.

No additional high-confidence semantic defect was found in #39. Test quality for the wizard was weaker than the server/export repairs and is addressed in Phase 3 below.

### Phase 2 completion

Phase 2 is complete after subphases 2-1, 2-2, and 2-3.

The final Phase-2 review did not treat CI success as semantic proof. It found and repaired:
- additional #38 tournament-scope error/mutation races;
- #36 privacy writers that bypassed Submission/Draw CAS invalidation;
- #37 auth backfill races against membership removal;
- #40 privacy writers outside entity namespaces;
- #41 Draw validation/generation outside entity namespace serialization;
- #35 raw-source completeness;
- #34 nullable compiled vote-rate semantics.

The next correctness risks are composition/interleaving/failure-atomicity rather than a known unreviewed individual-PR semantic gap.


## Phase 3 — regression-test quality / pre-fix failure audit

### Method

For each open audit PR, the regression tests were classified as:
1. direct behavioral unit/integration tests;
2. deterministic concurrency/interleaving tests;
3. source-text/wiring assertions.

For critical fixes, the corresponding pre-fix implementation was re-read to establish whether the regression assertion would actually be violated before the repair. Historical test-only branches were not created merely to manufacture red CI runs; that would add repository noise without changing the proof where the old control flow directly contradicts the assertion.

### #34

Behavior tests directly exercise:
- weighted filter ranking;
- strict availability filtering;
- two-team support-rate semantics;
- nullable vote-rate semantics.

Pre-fix failure is structurally established:
- the weighted implementation used a sparse `Array(n).map`, leaving comparisons tied;
- strict matching received unfiltered teams;
- compiled vote rate used signed vote margin / ballot count;
- the follow-up null cases returned fabricated zero.

Assessment: strong behavioral coverage.

### #35

Coverage includes:
- core metamorphic invariance to input permutation and duplicate/reordered round selectors;
- content-sensitive preview revision after same-cardinality ballot mutation;
- submission-source missing Draw matchup handling;
- raw-source missing Draw matchup handling;
- submissions/raw differential team/speaker compilation;
- subset-validation scoping.

Each assertion contradicts a concrete pre-fix path: duplicate `rs` iteration, count-only revision, absent Draw completeness checks, or unscoped raw validation.

Assessment: strong behavioral coverage.

### #36

Integration tests deliberately interleave:
- two admin Submission edits from one starting version;
- stale Submission edit against round renumber;
- stale Submission edit against privacy erasure;
- two Draw writes from one starting version;
- privacy Draw cleanup versus Draw version.

These tests exercise the CAS boundary rather than only checking implementation text.

Assessment: strong deterministic concurrency coverage.

### #37

Coverage directly verifies:
- managed-user tournament responses do not expose unrelated memberships;
- hidden tournament remains listing-only rather than becoming an authorization barrier;
- membership rollback uses the post-lease user state;
- auth legacy backfill cannot resurrect a membership removed while login was in flight.

The stale pre-lease test explicitly requires a second User read after lease acquisition, which the pre-fix controller did not perform.

Assessment: strong behavior/concurrency coverage.

### #38

The store layer has broad behavioral race coverage:
- A -> B scope clearing;
- stale success and stale error suppression;
- mutation/fetch ordering;
- concurrent loading state;
- mutation-only first use;
- raw-result same-scope invalidation;
- tournament metadata intent merge.

Several Vue page tests remain source-text/wiring tests. They are not counted as the primary semantic proof:
- the request-gate primitive itself has behavioral tests;
- store state machines are behavior-tested;
- the page source assertions verify that the tested primitives are actually wired into the relevant multi-step UI flow.

A full component-level async adversarial pass remains assigned to Phase 7.

Assessment: acceptable for Phase 3; source-text tests are supplementary, not sole proof of the core state-machine invariants.

### #39

Finding:
- rollback and detailed-export fixes already had direct behavioral tests;
- the ballot wizard regression was still primarily protected by source-text assertions.

Repair:
- wizard progress/revisit rules were extracted into `packages/web/src/utils/ballot-wizard.ts`;
- the participant ballot component now uses those helpers;
- behavioral unit tests verify reach-later -> go-back -> revisit-later semantics, step-list shrink clamping, and invalid-step rejection;
- the existing component source test remains only a wiring assertion.

Current #39 head after Phase-3 strengthening:
- `3baae8e2c1a0419a8e55ec8a99ef2dc3e12d9259`.

### #40

Boundary tests hit the real API/model/import entry points for:
- positive integer round fields;
- raw-team `win` finite [0,1];
- `tie_points` [0,1];
- entity template/details structure;
- duplicate detail rounds;
- backup import validation;
- namespace contention around Round/entity synchronization;
- privacy namespace/CAS behavior.

The pre-fix boundary paths accepted the tested invalid values or bypassed the relevant namespace/version guard.

Assessment: strong multi-entry behavioral coverage.

### #41

Server integration/lifecycle tests cover:
- Draw-authoritative publication state;
- pre-publication participant rejection;
- team-only versus full publication;
- compile/break/renumber/export-import/delete lifecycle;
- entity namespace contention for Draw writes and saved generation;
- moving/removing entities that were already assigned before becoming unavailable while rejecting new unavailable placements.

`AdminRoundAllocation.test.ts` contains source-text assertions for UI wiring, but the product invariants themselves are independently exercised by server integration tests. The source test is therefore not treated as sole correctness evidence.

Assessment: strong server/lifecycle coverage; UI wiring remains supplementary and will be stressed further in Phase 7.

### Phase 3 conclusion

No false-positive regression test was found that could satisfy the critical invariant while leaving the original defect intact.

One material test-quality weakness was found and repaired:
- #39 ballot wizard behavior no longer relies mainly on source-text assertions.

The remaining source-text Vue tests are explicitly classified as wiring checks. The underlying store/request-gate/server invariants they depend on have behavioral coverage, while full component-level async behavior remains scheduled for Phase 7.
