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
