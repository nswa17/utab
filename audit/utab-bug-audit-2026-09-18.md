# UTab bug audit log

Repository: `nswa17/utab`  
Audit branch: `codex/utab-bug-audit-20260918`  
Baseline: `main@6438f0b3b9586a96fe40e2ea887950bee34c3571`  
Started: 2026-09-18

This file is the persistent working log for the bug audit. Chat output should remain brief; low-severity observations, audit coverage, rejected suspicions, and follow-up items belong here.

## Phase 1 — repository map and attack surface

### Scope and status

Phase 1 maps code ownership, trust boundaries, data flows, persistence boundaries, and high-risk mutation paths. It is not intended to declare bugs unless something is already unambiguous. No production code was changed in this phase.

### Repository topology

UTab is a TypeScript monorepo managed by pnpm/Turbo.

- `packages/core`: allocation and result-compilation logic.
- `packages/server`: Express API, authorization, persistence, import/export, privacy operations.
- `packages/web`: Vue/Pinia admin and participant UI.
- `contracts/openapi/tab-v1.yaml`: partial API contract.
- `.github/workflows/ci.yml`: CI build/type/test checks.
- `docs/`: architecture, security, migration, UI and operations documentation.

Snapshot counts from the recursive tree:

| Area | files | TS/Vue-like files | test files/paths detected | bytes |
| --- | ---: | ---: | ---: | ---: |
| core | 63 | 59 | 23 | 287,885 |
| server | 130 | 128 | 12 | 1,200,771 |
| web | 249 | 240 | 67 | 2,208,397 |
| whole repository | 507 | — | — | — |

The server has 120 Express route operations across 18 route modules. The checked-in OpenAPI document currently describes 22 operations over 16 paths, so it should be treated as a partial contract rather than a complete inventory during later auditing.

### Runtime request pipeline

Primary browser/service request path:

```text
web / external client
  -> /api/v1 (and optional deprecated /api)
  -> CORS origin handling
  -> CSRF Origin/Referer check
  -> express-session / MongoStore
  -> HTTP + audit logging
  -> service-account JWT attachment
  -> service-account scope enforcement
  -> service-account idempotency-key requirement
  -> rate-limit identity + IP guard + slowdown/rate limit
  -> route-specific JSON/raw body parsing
  -> service-account idempotency handler
  -> route validation / authorization
  -> controller
  -> global MongoDB and/or tournament-specific MongoDB
  -> @utab/core for allocation/result algorithms where applicable
  -> response sanitizer / response
```

The same logical router is mounted under `/api/v1` and, when enabled, legacy `/api`. This creates a deliberate compatibility surface that later phases should verify for behavior parity.

### Authentication / authorization boundaries

Observed authorization primitives:

- Session auth through `express-session`.
- Service-account Bearer JWTs, with method-to-scope mapping:
  - GET/HEAD/OPTIONS -> `read`
  - POST -> `create`
  - PATCH/PUT -> `upsert`
  - DELETE -> `delete`
- Service-account write requests require `X-Idempotency-Key`.
- Tournament membership roles: organizer, adjudicator, speaker, audience.
- Global roles: superuser, organizer.
- Tournament access can also be granted through a tournament password/access session.
- `requireTournamentAdmin` protects administrative mutations.
- `requireTournamentView` / `requireTournamentAccess` gate public/participant reads and submissions.

Routes without explicit route-level authentication are expected to include login/register/logout, health, style listing, tournament listing, and tournament access/exit operations. These are not classified as bugs in Phase 1; they are inputs to later authorization review.

Participant-facing write surface is especially narrow and therefore high-value for focused testing:

- `POST /submissions/ballots`
- `POST /submissions/feedback`

Both use tournament-access authorization rather than tournament-admin authorization.

### Persistence boundaries

There are two distinct persistence domains.

**Global/default MongoDB domain**

Used for account- and tournament-level metadata such as users, tournaments, tournament memberships, sessions, service-token revocations, audit metadata, and related administrative state.

**Per-tournament MongoDB databases**

`getTournamentConnection(tournamentId)` creates/caches a Mongoose connection using database name:

```text
tournament-<tournamentId>
```

Per-tournament models include:

- teams
- speakers
- adjudicators
- institutions
- venues
- rounds
- draws
- submissions
- raw team/speaker/adjudicator results
- compiled results
- results

Indexes are created when a tournament connection is first established. Legacy duplicate draws are deduplicated before draw indexes are created.

Audit implication: multi-step operations that touch both the global DB and a per-tournament DB, or several collections inside a tournament DB, are prime candidates for partial-failure and concurrency review.

### Core algorithm surface

The most correctness-sensitive pure/business logic is concentrated in:

- `packages/core/src/allocations/teams.ts`
- `packages/core/src/allocations/teams/*`
- `packages/core/src/allocations/adjudicators.ts`
- `packages/core/src/allocations/adjudicators/*`
- `packages/core/src/allocations/venues.ts`
- `packages/core/src/results/results.ts`
- `packages/core/src/results/checks.ts`
- `packages/core/src/index.ts`

Primary algorithmic responsibilities:

1. team pairing / power pairing / strict matching / warning minimization,
2. side/position decisions,
3. adjudicator assignment,
4. venue assignment,
5. raw-result summarization,
6. team/speaker/adjudicator compilation,
7. ranking and derived quantities such as margins/opponent averages.

These functions operate on tournament-local numeric IDs and arrays of historical state. Later audits should emphasize invariants, missing/duplicate IDs, empty histories, odd cardinalities, ties, repeated rounds, and deterministic behavior under seeded randomness.

### Server mutation surface and hotspots

Largest server controllers by source size:

| controller | approximate size |
| --- | ---: |
| `compiled.ts` | 79 KB |
| `allocations.ts` | 68 KB |
| `rounds.ts` | 56 KB |
| `submissions.ts` | 54 KB |
| `draws.ts` | 31 KB |
| `raw-results.ts` | 22 KB |

High-risk workflows by domain:

**Allocation / draw**
- generate or upsert draw,
- team allocation,
- break allocation,
- adjudicator allocation,
- venue allocation.

**Round lifecycle**
- create/update/delete rounds,
- break candidate preview and break metadata changes,
- transitions that influence later draws/results.

**Submission / raw results**
- participant ballot submission,
- participant feedback submission,
- organizer edit/delete,
- conversion or synchronization into raw result collections.

**Compilation**
- preview compilation,
- create/delete compiled snapshots,
- team/speaker/adjudicator compilation,
- ranking/export consumers.

**Tournament lifecycle**
- create/update/delete,
- member add/remove,
- access password/session,
- full tournament ZIP export/import.

**Privacy/destructive operations**
- personal-data erase endpoints,
- erasure-request create/approve/reject/cancel/execute.

### Import/export and untrusted file/data surfaces

Important nontrivial ingress/egress paths:

- `POST /tournaments/import` accepts ZIP/octet-stream bodies with a 128 MB limit.
- Tournament export emits a bundle consumed by import.
- Web utilities support entity CSV import and draw/allocation import.
- Web utilities produce CSV, ZIP, certificate, slide/report and detailed-result exports.
- Markdown rendering is present in the web package.
- Tournament, team, adjudicator, speaker and other entities accept flexible `userDefinedData` / template/details fields in several schemas.

These should later be checked for schema drift, zip/path handling, oversized decompressed content, formula/CSV injection where relevant, and assumptions about imported IDs/references.

### Web state and UI attack surface

Routing divides into:

- admin authenticated flows under `/admin*`,
- public/participant flows under `/user/:tournamentId*`,
- participant ballot entry,
- participant feedback entry.

Primary state mutation lives in Pinia stores under `packages/web/src/stores`. Existing tests already show awareness of stale-request/race conditions (e.g. entity-store race and latest-request tests), which is useful but does not prove complete coverage.

Large UI files deserve special attention because they combine state, validation and workflow orchestration:

| file | approximate size |
| --- | ---: |
| `AdminRoundAllocation.vue` | 274 KB |
| `AdminTournamentHome.vue` | 209 KB |
| `AdminTournamentCompiled.vue` | 181 KB |
| `AdminRoundOperationsHub.vue` | 144 KB |
| `AdminTournamentSubmissions.vue` | 116 KB |
| participant ballot entry | 84 KB |

The API client can fail over among `/api/v1`, `/api`, and (for suitable hosts) an `api.<host>` origin for safe methods. Because fallback applies only to GET/HEAD/OPTIONS, later parity tests should distinguish reads from writes.

### Trust-boundary map

```text
anonymous browser
  |-- login/register
  |-- tournament list/style list
  |-- tournament access password
  |-- public tournament reads (subject to tournament config)
  v
session-authenticated user
  |-- membership-based tournament permissions
  |-- participant ballot/feedback paths
  |-- organizer/admin paths
  v
Express authorization + validation
  |----------------------|
  v                      v
global DB          tournament-specific DB
                         |
                         v
                     @utab/core
                         |
                         v
                   compiled/result state
                         |
                         v
                   reports / exports
```

Separate machine-client boundary:

```text
service account JWT
 -> token verification/revocation
 -> method scope
 -> tournament_ids restriction
 -> idempotency key / response replay layer
 -> same routes/controllers
```

### Phase-1 audit priorities derived from the map

Priority A — silent correctness / data corruption:
1. core allocation invariants,
2. compiled/raw-result semantics,
3. round/draw/submission state transitions,
4. multi-collection partial failures,
5. import/export reference integrity.

Priority B — cross-boundary security/correctness:
1. tournament isolation,
2. participant submission identity/authorization,
3. service-account tournament restriction + idempotency,
4. legacy `/api` vs `/api/v1` parity,
5. destructive privacy/delete flows.

Priority C — client consistency:
1. stale Pinia state after tournament switches,
2. concurrent requests,
3. admin workflow orchestration,
4. display/export disagreement.

### Low-severity / process observations recorded for later phases

These are audit-process observations, not confirmed user-facing bugs.

1. Root `pnpm lint` currently builds `core` and `server`; it does not invoke their package ESLint scripts.
2. The web package's own `lint` script is currently a placeholder (`lint not yet configured`). Root CI does run TypeScript checks for the web package.
3. There is no coverage gate in the examined CI workflow.
4. The OpenAPI file covers only a subset of the 120 route operations, so contract validation alone cannot establish API coverage.
5. Server integration coverage is concentrated in four very large integration files plus smaller unit/controller tests. This makes semantic coverage mapping more important than raw test count.
6. Several server controllers and admin Vue files are unusually large; these are audit hotspots because multiple state transitions and edge cases are likely co-located.
7. `docs/architecture-v2.md` describes a `legacy/` directory, while the current recursive tree snapshot did not show a top-level `legacy/` directory. Documentation drift only; no runtime impact established.

### Deferred questions for later phases

- Which state mutations are transactional, atomic, or safely idempotent across collections?
- Can the same participant submit or mutate logically duplicate ballot/feedback state under concurrency?
- Are all tournament-scoped entity lookups constrained to the selected tournament database and authorized tournament?
- Do compilation and allocation functions reject inconsistent IDs rather than silently coerce/ignore them?
- Are every legacy and v1 endpoint pair semantically equivalent where compatibility is intended?
- Does tournament import fully validate cross-document references before committing?
- Are result/export computations reading a coherent snapshot when concurrent edits occur?
- Can access-password version/session changes race with requests in flight?
- Are large per-tournament connection caches bounded/closed under realistic tournament churn?
- Which web stores fully reset state when tournament IDs change?

### Phase 1 conclusion

The repository map is complete enough to begin targeted auditing. No Phase-1 observation is yet classified as a confirmed major bug.

Recommended next audit phase remains Phase 2: test/CI semantic coverage mapping, using this attack-surface inventory to identify untested behavior rather than merely counting tests.


## Phase 2 — test and CI semantic coverage audit

### Scope and status

Phase 2 maps the existing tests and CI checks onto the Phase-1 attack surface. The goal is not raw line coverage; it is to identify which correctness/security invariants have regression protection and which high-risk behaviors remain untested.

No production code was changed in this phase.

### Current CI baseline

The latest CI run on the audited `main` baseline `6438f0b3b9586a96fe40e2ea887950bee34c3571` completed successfully on 2026-08-16.

CI currently performs:

1. frozen pnpm install,
2. root `pnpm lint`,
3. root `pnpm lint:web`,
4. root `pnpm test`,
5. root `pnpm build`.

The test job therefore exercises all three workspace packages through Turbo, and the final build gives the web package a full Vue typecheck through `typecheck:ci`.

### Important distinction: CI green does not include several configured checks

The following are not currently enforced by CI:

1. **Core/server ESLint is not run.**  
   Root `pnpm lint` is:
   ```text
   pnpm -C packages/core build && pnpm -C packages/server build
   ```
   even though both packages define actual ESLint scripts.

2. **Web ESLint is not configured.**  
   `packages/web` still has `"lint": "echo 'lint not yet configured'"`. CI does run TypeScript/Vue checks, but not lint rules.

3. **Coverage is configured but not collected in CI.**  
   All Vitest configs contain V8 coverage settings, but tests are invoked as `vitest run`, not `vitest run --coverage`. There are no thresholds/gates.

4. **OpenAPI validation is not run by workspace CI.**  
   `contracts/package.json` provides `validate:openapi`, but `contracts` is outside `pnpm-workspace.yaml` (`packages/*` only), and CI never enters `contracts`. Therefore schema validity/API-contract checks can regress while CI remains green.

5. **CI tests Node 20.11 only.**  
   The repository `.nvmrc` recommends Node 24. Runtime compatibility with the recommended local version is not a CI matrix target.

These are process/test blind spots, not confirmed runtime bugs.

### Core semantic coverage

Core coverage is relatively strong for deterministic algorithm behavior.

Existing tests cover:

- two-team allocation basics,
- power pairing brackets and pullups,
- one-up-one-down conflict reduction,
- strict matching,
- minimum-warning pairing,
- institution priority handling,
- repeated-opponent and school-pairing avoidance,
- side balancing,
- random/seeded allocation paths,
- adjudicator filters and class-based allocation,
- traditional/standard adjudicator paths,
- venue priority/shuffle/shortage behavior,
- result checks,
- tied results,
- bye rounds and non-infinite margins,
- speaker integration,
- adjudicator result compilation,
- DBHandler CRUD/composite raw-result identity.

Notable strengths:

- conflict-priority semantics have explicit regression tests;
- min-warning pairing tests include a 34-team repeated-school scenario;
- tie/fractional win behavior and bye margins are explicitly protected;
- seeded randomness is exercised.

Remaining algorithmic gaps worth targeting in Phase 3:

1. Property/invariant tests are limited. Examples not systematically exercised:
   - every available team appears at most once,
   - no adjudicator occupies two simultaneous slots,
   - no venue is assigned twice,
   - output cardinality matches the feasible input cardinality,
   - permutations of equivalent inputs do not alter invariant outcomes,
   - generated allocations always reference existing/available entities.

2. Larger randomized fields are only sparsely tested outside a few targeted cases.

3. BP/4-team positional-history logic has lighter edge coverage than two-team pairing.

4. Failure behavior for duplicated IDs, inconsistent historical result sets, and malformed-but-type-compatible domain objects is not comprehensively property-tested.

5. Results compilation tests are good on representative examples but not exhaustive over missing/duplicate round data and ordering invariance.

### Server semantic coverage

The server suite is stronger than the raw count of 12 files suggests because four integration files are very large and exercise many complete workflows.

Strongly covered areas include:

- health and legacy/v1 deprecation behavior,
- sampled legacy/v1 payload parity,
- CORS/origin checks,
- session registration/login/logout,
- service-account scope enforcement,
- required service-account idempotency key,
- service-token revocation,
- request body limits,
- tournament membership/access control,
- cross-tournament isolation,
- public response sanitization,
- hidden round/draw behavior,
- tournament access/password maintenance,
- audit-log pagination/filtering,
- CRUD conflict handling,
- unique draw-per-round index,
- round renumber/delete reference movement,
- raw-result validation/conflict handling,
- style reference integrity,
- ballot validation across score/identity/draw constraints,
- duplicate ballot rejection,
- **concurrent duplicate ballot rejection**,
- duplicate feedback rejection,
- admin submission update/delete,
- submission-based compilation,
- compile preview/save stale detection,
- break candidate derivation and bracket advancement,
- import/export happy-path round-trip,
- personal-data erasure,
- erasure request lifecycle,
- explicit failure-state test when erasure execution throws,
- tournament create/delete/member attach/remove rollback behavior,
- dev-tools authorization and idempotent fill behavior.

This is enough coverage that subsequent phases should not assume obvious CRUD/auth mistakes; the highest expected yield is now in unusual state combinations, concurrency, and partial failure.

### Server gaps prioritized for later phases

#### A. Concurrency coverage is narrow

Only one clearly targeted server race regression was found: concurrent duplicate ballot submission.

No equivalent explicit concurrency regression was found for:

- duplicate feedback submissions,
- same-key service-account idempotency requests arriving concurrently,
- simultaneous compile/save requests,
- concurrent draw generation/upsert,
- concurrent round renumber/update/delete,
- tournament access password/version changes during active requests,
- import/delete or other destructive lifecycle overlap.

These are high-value audit targets because many controllers perform read-validate-write sequences.

#### B. Failure-injection/atomicity tests cover only selected lifecycle operations

Good rollback tests exist for:

- tournament creation,
- tournament deletion,
- tournament membership add/remove,
- erasure request state transition after erase failure.

Equivalent failure injection was not found for other multi-write workflows such as:

- round renumber/delete reference migration,
- hard-delete privacy cleanup across references,
- tournament import after partial collection creation,
- draw/allocation replacement,
- compilation snapshot persistence,
- submission -> raw/compiled side effects where applicable.

This does not imply these paths are broken; it means partial-failure correctness is largely unproven by tests.

#### C. Tournament import is tested mainly as a valid round-trip

The integration suite verifies that an exported tournament bundle can be restored. Explicit adversarial tests were not found for:

- malformed ZIP/container data,
- malformed/missing manifest fields,
- corrupted collection payloads,
- dangling cross-document references,
- conflicting duplicate IDs,
- oversized decompressed content,
- interrupted/partial import cleanup.

Import is therefore a priority input-validation and atomicity surface for later inspection.

#### D. Legacy/v1 parity is sampled, not systematic

There are explicit parity checks for health, team list, personal-data erasure, and erasure workflows. The server mounts the same router under both namespaces, which reduces risk, but middleware/deprecation behavior still differs by prefix.

A route-by-route parity matrix is not present. This is lower priority than core/state correctness but remains useful before removing legacy compatibility.

#### E. Route wiring coverage is uneven for generic CRUD

The suite heavily exercises shared entity CRUD machinery, but not every method of every entity route is directly invoked. Examples include some update/delete combinations for adjudicators, speakers, institutions, and venues.

Because these controllers share `createTournamentEntityCrudHandlers`, this is mostly a route-wiring regression risk rather than independent business-logic risk.

### Web semantic coverage

Web tests are broad in utilities and Pinia race handling.

Strongly covered areas include:

- auth store behavior,
- compiled/draw/raw-result/submission/tournament stores,
- stale/latest request handling,
- concurrent loading-state behavior,
- entity bulk-delete behavior,
- public-viewing store behavior,
- router auth/admin guards,
- allocation warning/baseline/history helpers,
- ballot prefill and score helpers,
- break-round helpers,
- CSV/entity/draw import helpers,
- result/export utility functions,
- duplicate-submission and expected-submission accounting,
- admin allocation/workflow/compiled/setup views,
- participant home,
- participant ballot entry.

The codebase already contains several explicit race-regression tests for stores, which is a positive sign.

### Web gaps prioritized for later phases

1. **Participant feedback entry lacks a direct component regression test.**  
   `UserRoundBallotEntry.vue` has a dedicated test suite; `UserRoundFeedbackEntry.vue` does not appear in test code. Since feedback is one of only two participant write workflows, this is a high-value UI gap.

2. **Admin round-result workflow has limited direct component coverage.**  
   `AdminRoundResult.vue` appears in reload/navigation testing but does not have a focused behavior suite comparable to allocation/compiled/setup.

3. Several orchestration composables/helpers are tested only indirectly:
   - `useCompileWorkflow.ts`,
   - `useParticipantIdentity.ts`,
   - `useParticipantMode.ts`,
   - `compile-include-labels.ts`,
   - `tournament-team-ranking.ts`,
   - `tournament-break.ts`.

4. Large admin views are partly protected by smoke/workflow tests, but their full internal state spaces are too large for the current example-based tests to establish strong coverage.

### API contract coverage

The live router inventory has roughly 120 route operations. The checked-in OpenAPI contract describes 22 operations over 16 paths.

Consequences:

- the contract is intentionally/operationally partial;
- contract validation cannot detect drift for most endpoints;
- generated/external clients cannot rely on it as a complete server surface;
- CI currently does not validate even the partial contract.

Treat this as documentation/contract debt rather than a runtime defect unless external clients depend on undocumented behavior.

### Risk-oriented coverage matrix

| Area | Current regression protection | Main remaining blind spot |
| --- | --- | --- |
| core team allocation | strong | invariant/property fuzzing |
| adjudicator allocation | good | extreme cardinalities/invariants |
| venue allocation | moderate-good | global uniqueness/property tests |
| result compilation | good examples | ordering/missing/duplicate invariants |
| auth/tournament isolation | strong | access-version races |
| participant ballot | strong | more race/state interleavings |
| participant feedback | moderate | concurrency + UI component coverage |
| rounds/draws | good examples | concurrent mutation + partial failure |
| compiled snapshots | good workflow coverage | concurrent saves/reads |
| tournament lifecycle | strong | import partial failure |
| import/export | happy-path good | malformed/adversarial input |
| privacy erase | moderate-good | hard-delete partial-write failure |
| service-account auth | good | concurrent idempotency semantics |
| web stores | good | tournament-switch/state-reset completeness |
| UI orchestration | mixed | feedback/result paths, huge views |
| OpenAPI | weak/partial | most routes undocumented + not CI-validated |
| static lint | weak | core/server ESLint not run |
| code coverage enforcement | absent | no CI coverage measurement/threshold |

### Findings disposition

No major runtime bug was confirmed during Phase 2.

The most important output of this phase is that the audit should **not** spend Phase 3 rechecking already well-covered ordinary behavior. The best bug-finding targets are:

1. core invariant/property counterexamples,
2. concurrent feedback/idempotency/draw/compile operations,
3. multi-collection partial failure,
4. malformed tournament import,
5. participant feedback UI,
6. state-reset/tournament-switch races.

### Phase 2 conclusion

Existing tests are substantial and the audited main commit is CI-green. The main weakness is not absence of tests overall; it is lack of systematic invariant, concurrency, partial-failure, and adversarial-input testing around the highest-risk stateful workflows.

Proceed to Phase 3 with core algorithm correctness/invariant auditing, using counterexample-oriented tests rather than broad duplicate coverage of existing examples.


## Phase 3 — core allocation/result invariant audit

### Scope and method

Phase 3 was deliberately counterexample-oriented. The core allocation and result code was checked against invariants that should hold for all valid tournament histories and option choices.

Primary invariants:
- every generated debate has exactly style.team_num teams;
- team IDs are unique within a debate;
- an available team appears at most once in a round;
- unavailable teams are never auto-allocated;
- finite valid input always terminates;
- generated IDs come from the supplied entity set;
- advertised algorithm options actually affect the requested computation;
- comparators handle equality consistently enough for deterministic sorting and ties.

No production code was changed in this phase.

### P3-01 — HIGH: standard four-team pairing can duplicate the same opponent inside one debate

Status: confirmed by direct code trace.
Area: packages/core/src/allocations/teams/matchings.ts and teams.ts.
Impact: structurally invalid four-team/BP draw; invalid output can be returned and persisted by /draws/generate.

The standard algorithm calls mGaleShapley with cap = team_num - 1. For a four-team format cap is 3.

On a successful proposal the matcher appends the pairing but does not advance the proposer's rank pointer. Because both teams still have degree below cap, the proposer remains active and proposes to the same first-choice opponent again.

Minimal trace when team 1 ranks team 2 first:

    proposal 1: 1 -> 2  => 1:[2],     2:[1]
    proposal 2: 1 -> 2  => 1:[2,2],   2:[1,1]
    proposal 3: 1 -> 2  => 1:[2,2,2], 2:[1,1,1]

Teams 3 and 4 can behave analogously. getTeamAllocationFromMatching then constructs a debate from matching[teamId] plus teamId, producing rows like:

    [2, 2, 2, 1]
    [4, 4, 4, 3]

instead of one four-unique-team debate.

The server generateDraw path accepts standard for team_num=4, maps these rows to Mongo IDs, and can save them. The strong validateAllocationStructure routine used by manual draw upsert is not applied to generated output.

Why tests missed it:
- standard allocation tests are two-team examples;
- BP tests cover position logic or algorithms that explicitly reject four-team formats;
- manual four-team draw validation tests do not exercise automatic standard generation.

Required regression property: every row has team_num unique teams and flatten(allocation) contains each available team exactly once.

### P3-02 — HIGH: standard two-team matching can loop forever on a realizable preference profile

Status: confirmed by code trace using preferences generated by existing filters.
Area: packages/core/src/allocations/teams/matchings.ts.
Impact: a synchronous allocation request can block the Node event loop.

The outer loop continues while more than one team has degree below cap. If the first unmatched team has exhausted its preference list, its inner for-loop executes zero iterations. No state changes, yet remaining is recomputed only from match degree, so the same unmatched team is selected forever.

A concrete six-team ranking profile is:

    0: [1, 2, 4, 5, 3]
    1: [4, 2, 3, 5, 0]
    2: [0, 3, 4, 5, 1]
    3: [5, 2, 0, 1, 4]
    4: [1, 0, 3, 2, 5]
    5: [2, 3, 0, 4, 1]

This profile is realizable with filters [by_past_opponent, by_random]. One historical-opponent data set that yields it is:

    team 0: [1,1,3,3,4,5]
    team 1: [2,2,3,3,5,5]
    team 2: [1,3,4,4]
    team 3: [0,1,4]
    team 4: [2,3,3,5]
    team 5: [1,2,4,4]

With proposer order [0,1,2,3,4,5], the matcher reaches:

    0-1
    2-3
    4 displaces 0 from team 1  => 1-4, 0 unmatched
    0 displaces 3 from team 2  => 0-2, 3 unmatched

The remaining unmatched teams are [3,5]. Team 3 tries all remaining choices and is rejected, exhausting its rank pointer. The next outer iteration again chooses team 3, whose inner loop has no iterations. remaining stays [3,5] indefinitely.

Repeated opponents are valid historical data, so this is not a malformed-input-only scenario.

Required correction property: every outer iteration must either alter matching, advance a pointer, or remove an exhausted proposer from the active set; a finite proposal bound should exist.

### P3-03 — HIGH: strict pairing ignores round availability

Status: confirmed by direct data-flow inspection.
Area: packages/core/src/allocations/teams.ts and strict_matchings.ts.
Impact: absent/unavailable teams can be auto-allocated and persisted.

Standard, min_warnings, powerpair, and random all derive an available subset. Strict passes the complete teams array into strictMatching. strictMatching then builds teamIds from every team and never checks the round availability flag.

The ordinary precheck does not repair this. It verifies divisibility using the count of available teams, but the strict matcher still consumes the full team list. Example: four registered teams in a two-team format, two available and two unavailable. Precheck sees two available teams and succeeds; strict can allocate all four.

The /api/draws/generate path does not run generated output through the manual-upsert availability validator before save.

Existing strict tests use all-available teams.

Required regression property: the flattened strict allocation must equal the round-available team set, excluding only explicitly modeled byes.

### P3-04 — HIGH cross-layer: /draws/generate can save incomplete draws when team cardinality is invalid

Status: confirmed by control flow.
Area: core standard/random allocation plus server generateDraw.
Impact: malformed generated output can bypass validation that correctly rejects the same shape through manual upsert.

The dedicated allocation endpoints invoke team precheck, which is why existing odd-team tests receive NeedMoreTeam. The /api/draws/generate path does not invoke the same precheck.

For team_num=2 with three available teams:
- standard matching stops with one unmatched team, after which getTeamAllocationFromMatching emits a one-team row;
- random allocation chunks the shuffled list by team_num, so the final slice is a one-team row.

generateDraw maps that output and, with save=true, writes it directly through saveDrawWithOptimisticLock. validateAllocationStructure is only used by upsertDraw.

This is recorded in Phase 3 because it amplifies core algorithm failures, and should be revisited in the Phase-4 server audit.

### P3-05 — MEDIUM: weighted standard ranking silently ignores its filters

Status: confirmed.
Area: packages/core/src/allocations/teams.ts.

Weighted ranking constructs weights using Array(filterFunctions.length).map(...). Array(n) is sparse, so map does not populate the slots. weights[index] is therefore undefined.

integrateFilterFunctions then evaluates undefined * filter_result, producing NaN. Once the accumulator is NaN, both comparisons against zero are false and the comparator returns 0. Every candidate is treated as tied, so method=weighted effectively preserves pre-sort order rather than applying weighted filters.

The existing weighted test verifies only result shape and team IDs, not ranking semantics.

### P3-06 — MEDIUM: custom standard ranking also collapses when weights are missing or too short

Status: confirmed.
Area: packages/core/src/allocations/teams.ts and server allocation option validation.

Custom ranking uses the user-provided weights array directly. The default is an empty array, and the server schema permits weights to be omitted or have arbitrary length.

If any selected filter has no corresponding weight, undefined * filter_result produces NaN and the complete comparator again becomes a tie.

Therefore method=custom with no weights, or with fewer weights than filters, silently disables the ranking instead of returning a validation error or applying documented defaults.

### P3-07 — MEDIUM: strict pairing_method=adjusted has an invariant objective and is effectively a no-op

Status: confirmed from objective construction.
Area: packages/core/src/allocations/teams/strict_matchings.ts.

pairingFuncAdjusted enumerates candidate partitions. For each division it calls combinations(div, div.length), which returns only the entire division. The measure then sums past_sides.length over all teams in that division.

Across a complete partition, summing this measure over divisions is simply the total historical-side count over all teams, independent of how teams are partitioned. All candidates therefore receive the same objective value and the first generated candidate wins.

The separate adjusted position method still changes positions within a match; this finding is specifically about adjusted pairing.

### P3-08 — LOW/MEDIUM robustness: several comparators violate equality/antisymmetry

Status: implementation issue confirmed; observed impact is primarily tie ordering/determinism.
Area: packages/core/src/general/sortings.ts.

Several comparators return -1 even for exact equality. Thus for tied records compare(a,b) and compare(b,a) can both be -1 instead of zero.

insertRanking happens to preserve equal ranking numbers in many cases because it increments only when the comparator returns 1, but sorting tied inputs is not a valid total ordering. This can reverse or reorder ties and lets allocation order depend on sort-engine behavior rather than an explicit tie breaker.

Not classified as a major result-corruption bug at this stage.

### P3-09 — MEDIUM suspect: compiled vote_rate changes scale relative to round vote_rate

Status: semantic inconsistency confirmed; intended public meaning still needs contract/UI tracing.

For a two-team round, summarizeTeamResults defines vote_rate as winning ballots divided by ballot count, in [0,1].

During multi-round compilation, the code accumulates result.vote, where vote is the net wins-minus-losses count, then divides that net value by acc. The compiled field is therefore approximately in [-1,1], despite using the same vote_rate name.

No core test was found asserting compiled vote_rate semantics. Logged as a suspect until downstream expectations are traced.

### P3-10 — LOW/MEDIUM suspect: raw-result weight is accepted and stored but ignored by core aggregation

Status: interface/implementation mismatch; intent uncertain.

Raw team, speaker, and adjudicator result types expose weight; Mongo models default it to 1; API schemas accept it. Core summarization does not read weight and performs unweighted counts/averages.

Existing tests use weight=1 and therefore cannot distinguish intended weighting from ignored metadata. This should not be labeled a user-facing defect until the intended API meaning is established.

### Result-side suspicions that were reduced or rejected

1. Repeated short-team speaker slots: submission compilation can encode repeated participation in score arrays, and an existing server regression explicitly verifies PDA4 short-team repeated slots. No defect recorded from roster deduplication alone.
2. Weighted speaker score formula: seeded styles pair half-weight reply roles with half-scale score ranges, so the formula may be a legacy normalization convention. Insufficient evidence for a bug.
3. Empty averages and SDs returning zero: product-semantic choice, not demonstrated corruption.
4. min_warnings: availability and odd-cardinality checks are explicit for its supported two-team format.
5. powerpair: filters availability and explicitly rejects non-two-team formats.
6. adjudicator stable matching: the same immediate duplicate-recipient defect as team many-to-many matching was not established.

### Why the current tests pass

The suite is strong on examples but does not enforce universal allocation properties.

The missing assertions that expose these defects are:

    flatten(allocation) == available_team_ids
    each row has exactly team_num unique teams
    each available team occurs exactly once
    allocation always terminates
    weighted/custom modes obey requested ranking semantics
    strict output contains no unavailable teams

The weighted test checks shape only. Strict tests use all-available data. Standard tests are overwhelmingly two-team examples. Generated-draw tests do not apply the manual draw structural validator to generated output.

### Remediation priority for the later fix phase

1. P3-02 non-terminating standard matching — process/event-loop availability risk.
2. P3-01 invalid four-team standard pairing — direct draw corruption in an intended tournament format.
3. P3-03 strict allocation of unavailable teams — operational correctness.
4. P3-04 generated-draw precheck/validation gap — defense-in-depth boundary that also contains future core failures.
5. P3-05/P3-06 weighted/custom ranking no-op.
6. P3-07 adjusted strict pairing no-op.
7. Comparator cleanup and semantic suspects.

A robust fix should not rely only on repairing each core algorithm. The server generation boundary should independently reject any generated allocation violating cardinality, uniqueness, known-ID, or availability invariants before returning or saving it.

### Phase 3 conclusion

Phase 3 found multiple real core defects, including three high-severity algorithm failures and a high-severity cross-layer guard gap.

Highest-confidence findings:
- standard four-team allocation can generate duplicate teams inside a debate;
- standard two-team matching has a realizable infinite-loop state;
- strict matching can allocate unavailable teams;
- generated draws bypass structural/cardinality validation;
- weighted/custom standard ranking can silently become a no-op;
- strict adjusted pairing does not perform meaningful adjustment.

Phase 4 should inspect server state transitions with special attention to whether controller-level validation independently contains malformed core output. Production fixes remain deferred to the dedicated regression/fix phase.


## Phase 4 — server state-transition / DB-consistency audit

### Scope and method

Phase 4 focused on state transitions that span more than one document or collection, especially operations with a read -> validate -> multiple writes pattern.

The main consistency invariants used were:

- a round number change must move the Round document and every round-scoped reference as one logical state transition;
- deleting a round must either remove the round and all dependent data, or leave the pre-delete state intact;
- a write validated against a round/draw must not be committed later against a different state without detecting staleness;
- break metadata and per-team availability must describe the same participant set;
- submitted ballots/feedback must retain the historical context under which they were accepted;
- a compiled snapshot should be derived from one coherent logical state;
- a failed destructive/privacy operation should have explicit semantics for partial completion;
- concurrent mutations must not overwrite unrelated changes by replacing stale full-document arrays.

No production code was changed in this phase.

A repository-wide search found no controller use of MongoDB startSession/withTransaction. The supplied Docker/VPS deployment also runs a standalone MongoDB service rather than a replica set, so multi-document transactions are not available in the current default deployment topology without an infrastructure change. This makes CAS, atomic targeted updates, compensation, operation journals, and explicit repair paths especially important.

### P4-01 — HIGH: concurrent round renumber can split the Round number from all dependent data

Status: confirmed by a concrete request interleaving.
Area: packages/server/src/controllers/rounds.ts.
Impact: draw/submission/result/raw-result/entity-detail data can end up assigned to a different round number than the Round document.

Single-round renumber uses a fixed temporary value:

    temporaryRound = -2000000000

The flow is:

    read Round at previousRound
    check target conflict
    update Round previous -> temporary
    move dependent references previous -> temporary
    move dependent references temporary -> target
    findOneAndUpdate Round to target
    rewrite nested source_round references

The first update filters on the old round number, but its matchedCount is never checked. The final Round update has no expected version or expected round condition.

A normal two-request interleaving is sufficient:

Initial state:

    Round R has round = 1
    dependent records have round/r = 1

Request A wants 1 -> 2.
Request B wants 1 -> 3.
Both read R while it is still round 1 and both pass their conflict checks.

Then:

    A: Round 1 -> TEMP succeeds
    B: Round 1 -> TEMP matches zero documents; result is ignored

    A: dependencies 1 -> TEMP
    B: dependencies 1 -> TEMP sees nothing

    A: dependencies TEMP -> 2
    B: dependencies TEMP -> 3 sees nothing

    A: final Round update -> 2
    B: final Round update -> 3

The final state can therefore be:

    Round document: round = 3
    draws/submissions/raw results/entity details: round = 2

No exceptional infrastructure failure is required; two ordinary admin requests are enough.

Bulk renumber has the same general vulnerability. It uses per-request temporary round values and multiple phases of unversioned multi-collection writes. Two concurrent bulk/single renumber operations do not share an operation lock or epoch.

Existing tests cover duplicate target conflicts in sequential requests, not concurrent renumbering.

### P4-02 — HIGH: stale writers can recreate orphaned old-round data during renumber/delete

Status: confirmed from request lifecycles.
Area: rounds.ts, draws.ts, submissions.ts.
Impact: a round can be renumbered/deleted successfully while a previously validated request writes new data under the old round number afterward.

Validation and commit are not tied to a round version.

Representative ballot race:

    1. ballot request reads/validates Round 1 and its Draw 1
    2. admin renumbers Round 1 -> Round 2
       existing submissions/draws/results are migrated
    3. original ballot request resumes
    4. SubmissionModel.create writes a new submission with round = 1

The database now contains a submission for a round that no longer exists.

Equivalent windows exist for draw creation/upsert: the controller verifies that a Round exists early in the request, then saves the draw later without proving that the same round state still exists.

A destructive variant exists with delete versus renumber:

    1. delete request reads Round R with round = 1
    2. concurrent renumber moves R and its references to round = 2
    3. delete request deletes dependencies for round = 1, now deleting little/nothing
    4. delete request deletes R by _id, which is now Round 2

Dependent data migrated to round 2 remains, but its Round document is gone.

This family needs a round mutation version/epoch or a stronger operation lock propagated through all round-scoped writes.

### P4-03 — HIGH: break participant metadata and team availability can diverge under concurrent updates

Status: confirmed by a concrete interleaving.
Area: updateRoundBreak in rounds.ts.
Impact: the Round can name one break field while a different set of teams is marked available for that break round.

updateRoundBreak performs two independent state transitions:

    1. findOneAndUpdate Round.userDefinedData with break participants
    2. bulkWrite every Team.details array to synchronize availability

There is no transaction and no Round version/CAS check. The team details are calculated from a team snapshot read before the Round write.

Example:

    Request A selects teams A,B
    Request B selects teams C,D

    A writes Round metadata = A,B
    B writes Round metadata = C,D
    B writes team availability = C,D
    A writes team availability = A,B

Final state:

    Round break.participants = C,D
    available teams in that round = A,B

All calls can return success.

The same full-array team writes can also overwrite an unrelated concurrent edit to team round details.

Sequential tests verify the intended A,B -> A,B state, but no concurrency regression exists.

### P4-04 — HIGH: submitted ballots/feedback are reinterpreted using the current draw at compile time

Status: confirmed; sequentially reproducible, no race required.
Area: submissions.ts + compiled.ts.
Impact: already accepted historical submissions can silently change side history and adjudicator experience after an admin edits the draw.

A ballot stores teamAId/teamBId, winner/draw, speaker IDs, scores, etc. It does not store the side assignment or draw version under which it was accepted.

A feedback submission stores adjudicatorId and score/comment. It does not store the teams that adjudicator was judging or the draw version.

Compilation from submissions loads the current Draw collection and reconstructs:

    sideByRoundTeam from current draw allocation
    judgedTeamsByRoundAdj from current draw allocation

Then it creates raw team results using the current side map, and raw adjudicator results using the current judged-team map.

Deterministic reproduction:

    1. save/open Draw 1 with Team A = gov, Team B = opp, Judge J assigned
    2. submit a valid ballot and/or feedback
    3. admin edits the still-unlocked draw
       - swap A/B sides, and/or
       - move Judge J to another matchup
    4. compile from submissions

The ballot's historical side is now derived from the edited draw rather than the draw seen when the ballot was accepted. Judge J's judged_teams can likewise change to the new matchup.

If a submitted team no longer appears in the edited draw, compilation can fall back to the default teamA=gov/teamB=opp assumption, creating a different form of historical reinterpretation.

This affects future allocation because compiled past_sides and adjudicator judged-team history feed allocation logic. It can therefore propagate beyond display/reporting into later-round pairings and adjudicator allocation.

The draw model has an optimistic __v mechanism, but Submission does not persist draw id/version/hash and draws are not automatically frozen once submissions exist.

Recommended invariant: submission-time allocation context must be immutable or explicitly versioned. A practical design is to store drawId/drawVersion plus canonical sides/judged teams in the normalized submission, or refuse draw-semantic edits after accepted submissions unless an explicit migration/revalidation operation is performed.

### P4-05 — HIGH: round create/delete operations are not failure-atomic and can lose data on ordinary write failure

Status: confirmed by control flow.
Area: rounds.ts.
Impact: API can return failure after a partially committed destructive transition.

Round creation:

    RoundModel.create / insertMany
    then syncEntityRoundDetailsForCreate

If team/adjudicator/venue synchronization fails, the newly created Round remains in the database. There is no rollback of the Round or compensation for whichever entity bulk writes already succeeded.

Round deletion is more dangerous:

    deleteRoundDependencies:
        delete draws
        delete submissions
        delete results
        delete raw team results
        delete raw speaker results
        delete raw adjudicator results
        all launched through Promise.all

    then delete Round
    then remove entity round details
    then rewrite source_round references

If one dependency deletion rejects, Promise.all rejects, but the other deletion operations are already in flight and can succeed. The Round deletion step is skipped. The API can therefore return 5xx while the Round still exists but some ballots/results/draws have already been irreversibly deleted.

If deletion of the Round succeeds but later entity-detail cleanup or source-round rewriting fails, the opposite partial state is produced.

bulkDeleteRounds has the same structure.

Existing tests exercise normal deletion and reference rewriting, not failure injection across each write boundary.

### P4-06 — MEDIUM/HIGH: stale full-array read/modify/write helpers can overwrite concurrent edits

Status: confirmed pattern with multiple concrete sites.
Area: rounds.ts and privacy.ts, with additional effects on Draw.userDefinedData.

Several maintenance functions read an entire document/array, modify it in application memory, then replace the full field with $set and no expected-version filter.

Examples:

- syncEntityRoundDetailsForCreate/Delete replaces complete Team.details, Adjudicator.details, and Venue.details arrays.
- updateRoundBreak replaces complete Team.details arrays for every team.
- removeSpeakerRefsFromTeams replaces complete team template/details speaker arrays.
- removeAdjudicatorRefsFromDraws replaces complete draw allocation arrays.
- rewriteStoredRoundReferences replaces Round.userDefinedData and Draw.userDefinedData from a stale read.

Concrete lost-update pattern:

    maintenance request reads Team.details
    normal admin request edits another round detail and commits
    maintenance request writes its stale reconstructed Team.details
    admin edit disappears

The Draw reference-rewrite path is especially misleading: it increments __v but does not filter on the version it originally read. If a normal optimistic draw update commits between the rewrite read and rewrite write, the rewrite can overwrite the newer userDefinedData and then increment the version, making the stale overwrite look like a fresh revision.

Targeted positional/array-filter updates or expected-version filters are preferable to whole-array replacement.

### P4-07 — MEDIUM/HIGH: compiled payloads are not read from a coherent database snapshot

Status: confirmed architectural consistency gap; reproduction requires concurrency timing.
Area: compiled.ts.
Impact: a saved compiled snapshot can combine entities/submissions/draws/round metadata from different logical moments.

Compilation from submissions starts independent queries for:

    teams
    adjudicators
    submissions
    draws
    rounds

using Promise.all, but they are separate Mongo reads with no shared snapshot transaction/session.

If an admin edits a draw, round, team roster, or submission while these reads are executing, different query results can reflect different sides of the change.

The preview/save signature mechanism is useful but does not eliminate this:

- the preview itself can be built from a mixed read;
- createCompiled can be called without preview_signature/revision for backward compatibility;
- even when tokens are supplied, the save rebuild detects differences between two compiled payloads, not whether either payload came from a coherent database snapshot.

This is especially relevant because side/adjudicator history is reconstructed by joining submissions against draws.

A coherent compile requires either a database snapshot transaction, a logical tournament/round revision checked around the read set, or retry-until-stable semantics.

### P4-08 — MEDIUM/HIGH: hard-delete privacy erasure can be marked failed after irreversible partial mutation

Status: confirmed by control flow.
Area: privacy.ts + erasure-requests.ts.

Speaker hard-delete:

    clear matching submission comments
    in parallel:
        remove speaker refs from teams
        delete raw speaker results
    delete Speaker document

Adjudicator hard-delete is analogous, with draw refs and raw adjudicator results.

There is no transaction or compensation.

If one parallel operation succeeds and another fails, the request transitions to failed but the successful mutation is not undone. Submission comments are cleared before the hard-delete branch and are also not restored.

A retry may eventually converge toward full erasure, but the state label failed does not mean the tournament is unchanged. This distinction matters for operators and compliance workflows.

The erasure request status transition itself is comparatively strong: approved -> running uses a conditional update, so duplicate concurrent execution is guarded. Existing tests verify failed request status, but not the exact residual data after failure.

### P4-09 — MEDIUM: service-account idempotency can amplify partial 5xx mutations

Status: confirmed interaction risk.
Area: service-account-idempotency.ts plus non-atomic mutation endpoints.

The idempotency middleware deletes an in_progress record after any 5xx response. This is reasonable for operations assumed not to have committed, but several Phase-4 endpoints can mutate multiple collections and only then fail.

Example:

    round deletion deletes some dependencies
    later dependency write fails -> 5xx
    idempotency record is deleted
    client retries same key
    operation executes again against already-partially-mutated state

Thus service-account idempotency does not provide exactly-once semantics for these multi-step endpoints.

A second, lower-severity issue is that completion persistence runs asynchronously on response finish. If updating the idempotency record fails after a successful response, the record can remain in_progress until TTL and subsequent identical requests receive 409 rather than replaying the successful result.

### P4-10 — MEDIUM: import cleanup is best-effort and cleanup failures are discarded

Status: confirmed; failure-path issue only.
Area: tournament-import.ts.

Import has a reasonable explicit cleanup path: delete central tournament/audit/membership state, pull the user reference, drop the per-tournament DB, and remove a newly created style.

However cleanup is executed with Promise.allSettled and the rejected cleanup results are not surfaced or persisted. The original import error is rethrown regardless.

If the import fails after some collection inserts and one cleanup operation also fails, an orphan Tournament record, membership, style, user reference, or tournament database may remain with no repair record indicating which cleanup step failed.

This is less likely than the round-state bugs but should be logged/alerted as an incomplete-import repair condition rather than silently discarded.

### Positive controls found in Phase 4

Not every stateful path is weak. Several mechanisms are worth preserving:

1. Existing Draw updates use optimistic locking through __v and return conflict when the expected version no longer matches.
2. Draw creation relies on a unique tournamentId+round index.
3. Ballot and feedback duplicate prevention is backed by a unique dedupeKey index, so the pre-check race is contained by MongoDB uniqueness.
4. Erasure request execution uses a conditional approved -> running transition, preventing two normal executors from starting the same request.
5. Tournament creation has explicit membership rollback.
6. Tournament deletion snapshots central metadata and attempts restoration if central cleanup or database drop fails.
7. Compiled preview/save hashes the rebuilt payload and can reject an explicitly supplied stale preview token.

These controls show that the codebase already uses the right primitives in isolated places; the main issue is that the same concurrency discipline is not applied consistently to round lifecycle and historical submission context.

### Test gaps exposed by this phase

High-value missing regressions:

- two concurrent renumbers of the same Round to different targets;
- renumber concurrent with ballot creation;
- delete concurrent with renumber;
- draw save concurrent with round delete/renumber;
- two concurrent break-participant updates with syncTeamAvailability=true;
- failure injection after Round creation but before all entity detail syncs finish;
- failure injection in each dependency deletion during round delete;
- ballot submission -> draw side swap -> compile, asserting original side history remains stable;
- feedback submission -> adjudicator moved to another matchup -> compile, asserting judged teams remain submission-time teams;
- concurrent draw/submission edits during compile;
- hard-delete erasure failure after one destructive branch succeeds;
- service-account retry after a partial mutation ends in 5xx.

Current tests cover normal round migration/reference rewriting and sequential break availability sync, but do not exercise these interleavings.

### Remediation priority for the later fix phase

1. Preserve immutable submission-time draw context, or prevent semantic draw edits after submissions.
2. Add a round lifecycle revision/epoch or operation lock and require it on renumber/delete and every round-scoped write.
3. Make break metadata + team availability one guarded logical transition; avoid full-array stale writes.
4. Add server-side compensation/operation journaling for round create/delete because the current default Mongo deployment is standalone.
5. Replace full-array maintenance writes with targeted atomic updates and/or expected-version filters.
6. Give compilation coherent-read semantics via a revision envelope/retry-until-stable design, or move deployment to a topology supporting snapshot transactions.
7. Define partial-failure semantics and repair/retry state for destructive privacy/import operations.
8. Revisit service-account idempotency only after endpoint mutation semantics are made failure-atomic.

### Phase 4 conclusion

Phase 4 found several state-integrity bugs that are more serious than ordinary missing rollback.

The strongest findings are:

- concurrent round renumber can leave the Round and its dependent records on different round numbers;
- stale in-flight ballot/draw writes can recreate old-round orphan data after renumber/delete;
- concurrent break updates can make break.participants disagree with team availability;
- accepted ballots/feedback are reinterpreted against the current editable draw during compilation;
- round deletion can partially and irreversibly delete data while the Round itself survives.

The submission-time draw reinterpretation is particularly important because it is sequentially reproducible and can silently alter historical data without any server error.


## Phase 5 — authorization / tournament isolation / public-data audit

### Scope and method

Phase 5 audited the authorization boundary rather than only checking whether routes have middleware attached. The review traced:

- global role versus tournament-scoped membership;
- public View versus tournament Access versus tournament Admin;
- identity binding for participant submissions;
- cross-tournament/global resources such as styles and service-token revocations;
- public response sanitization;
- object lookup filters and mixed-tournament payloads;
- legacy /api versus canonical /api/v1 behavior;
- tournament password storage and access-session expiry.

The current security roadmap was used as the intended access-control contract because it explicitly defines View, Access, and Admin as separate capabilities and marks the corresponding phases complete.

No production code was changed in this phase.

### P5-01 — HIGH: requireTournamentAccess is currently identical to public View, allowing unauthenticated writes to passwordless tournaments

Status: confirmed implementation/spec regression.
Area: packages/server/src/middleware/auth.ts and routes/submissions.ts.
Impact: unauthenticated internet clients can create ballot/feedback records in a public/passwordless tournament without first obtaining a tournament-access session.

The security design explicitly distinguishes:

    View:
      public tournament -> unauthenticated read allowed

    Access:
      submissions/result sending -> tournament-access session or admin required
      regardless of auth.access.required

The current implementation collapses the two:

    requireTournamentView(...)   -> requireTournamentRole(...)
    requireTournamentAccess(...) -> requireTournamentRole(...)

Inside requireTournamentRole, after membership/session checks:

    if (isPublic) {
      next()
      return
    }

Therefore a public tournament bypasses the access-session requirement entirely.

The affected participant writes are:

    POST /submissions/ballots
    POST /submissions/feedback

which are guarded by requireTournamentAccess.

This is not merely theoretical. An existing integration test creates a tournament and later submits feedback using a fresh request(app) call and expects HTTP 201. A prior /tournaments/:id/access request is also made with a separate non-agent request, so no session cookie is carried to the submission. The test therefore currently locks in the bypass.

The fix should restore Access as a distinct predicate:

- organizer/superuser admin: allow;
- valid tournamentAccess session/version: allow;
- possibly explicitly authenticated participant membership if that is the chosen product model;
- public visibility by itself must not satisfy Access.

The normal /api/submissions limiter reduces spam volume but does not restore authorization.

### P5-02 — HIGH: ballot/feedback submitter identity is caller-selected and not bound to an authenticated entity

Status: confirmed integrity vulnerability.
Area: submissions.ts + participant web identity flow.
Impact: a caller who can access the tournament can impersonate an allocated adjudicator/team/speaker and can submit first under that identity, potentially blocking the legitimate submission through deduplication.

The server resolves the actor as:

    submittedEntityId if supplied
    otherwise session userId

The supplied entity ID is validated for tournament existence and current draw eligibility, but no server-side relationship proves that the caller controls that adjudicator/team/speaker identity.

Examples:

- ballot UI explicitly lets the user select the submitter adjudicator;
- feedback UI lets the user select the team/speaker/adjudicator actor;
- participant identity is persisted in browser localStorage;
- TournamentMember maps userId -> role but does not map a user to a concrete team, speaker, or adjudicator entity.

This means authorization currently answers "is this entity allowed to submit?" but not "is the requester this entity?"

An attacker does not need to guess opaque IDs in normal operation. Public entity/draw endpoints expose the IDs needed by the participant UI when those entities/allocations are published.

The dedupe index strengthens the denial effect: if an attacker submits a valid ballot as Judge J for matchup A-B first, the legitimate Judge J later receives the duplicate-submission conflict.

P5-01 makes this remotely exploitable without any session for passwordless tournaments. Even after P5-01 is corrected, entity impersonation remains possible for any holder of the shared tournament-access credential unless identities are bound separately.

A durable design needs an authenticated participant/entity binding or a per-entity submission capability/token. Client-side selection/localStorage is not an identity proof.

### P5-03 — CRITICAL: any self-registered organizer can mutate global Styles used by other tournaments

Status: confirmed cross-tenant privilege failure.
Area: routes/styles.ts, controllers/styles.ts, global StyleModel.
Impact: an arbitrary newly registered organizer can change scoring/role/style configuration consumed by tournaments they do not administer.

The application intentionally allows organizer self-registration. Tournament administration elsewhere is correctly constrained by TournamentMember.

Styles are different:

    POST   /styles      -> requireOrganizer
    PATCH  /styles/:id  -> requireOrganizer
    DELETE /styles/:id  -> requireOrganizer

requireOrganizer checks only the global User.role/service-account role. It does not require superuser or a tournament-scoped privilege.

StyleModel is global, and Tournament documents reference styles by numeric style ID.

updateStyle protects only a change of the numeric style ID when a tournament references it. It does not prevent modification of the content of an in-use style. Thus a freshly self-registered organizer can PATCH style 1, 2, etc. and alter fields such as:

    team_num
    score_weights
    score ranges
    speaker sequence
    side labels
    roles
    adjudicator ranges

Those fields are read by ballot validation, compilation, participant UI, and other tournament workflows. The attacker therefore does not need membership in the victim tournament.

The built-in-style seed does not self-heal this on restart: seedStyles uses $setOnInsert, so an existing modified style remains modified.

This violates the documented rule that organizer authority is limited to created/member tournaments and creates a direct cross-tenant integrity/availability path.

Recommended boundary: global style mutation should be superuser-only, or styles should become tournament-owned/versioned immutable resources.

### P5-04 — HIGH: any self-registered organizer can list and globally revoke service-account tokens

Status: confirmed global privilege failure.
Area: routes/auth.ts, controllers/auth.ts, ServiceTokenRevocationModel.
Impact: an ordinary organizer can revoke service credentials outside that organizer's tournament scope.

The routes are:

    GET  /auth/service-token-revocations  -> requireOrganizer
    POST /auth/service-token-revocations  -> requireOrganizer

Again, requireOrganizer is a global role check, and organizer is self-registerable.

Service-token revocation state is global and keyed by jti. Token verification rejects a token whenever its jti is found in this global collection; there is no tournament or org restriction on the revocation action.

The integration suite explicitly demonstrates a newly registered ordinary organizer revoking a service token and causing subsequent bearer-token use to return 401.

Knowledge of the jti is required, but it is not necessarily secret. Audit records for service-account requests include serviceAccountJti; a tournament admin can read audit logs for their tournament and can therefore learn a jti used there. If that token is shared across multiple tournament scopes, the organizer can revoke it globally.

The listing endpoint also exposes global revocation metadata (jti, reason, revokedBy, timestamps) to every organizer.

Recommended boundary: token revocation/listing should be superuser/platform-admin scoped, or explicitly constrained to an organization model that is cryptographically/authoritatively bound to the token.

### P5-05 — HIGH: newly created or rotated tournament access passwords are persisted in plaintext until startup maintenance hashes them

Status: confirmed secret-at-rest regression.
Area: tournament-access.service.ts, tournaments.ts, startup maintenance.
Impact: current tournament access passwords are stored as plaintext in central MongoDB for the lifetime of the running server after create/rotation.

mergeTournamentAuth is async but does not hash a supplied password. When incoming access.password is a non-empty string it does:

    password = nextPassword
    passwordHash = undefined

and emits:

    accessPayload.password = password

createTournament/updateTournament then persist that auth object.

accessTournament supports both passwordHash verification and a plaintext fallback, so the plaintext representation is actively used.

There is a startup maintenance routine that converts legacy access.password to passwordHash, but it runs only during startup data maintenance. Thus:

    server starts
    organizer creates/rotates tournament password
    plaintext password is stored
    it remains plaintext until a later successful restart/maintenance pass

The security roadmap marks passwordHash normalization as implemented, so this is not only a hardening preference; it is a regression from the documented design.

API response sanitization correctly hides password/passwordHash from clients, but that does not protect database-at-rest secrecy.

The write path should hash immediately and should never persist a newly supplied plaintext tournament password.

### P5-06 — MEDIUM: the documented two-hour inactivity expiry for tournament access sessions is not implemented

Status: confirmed documentation/implementation mismatch.
Area: auth middleware + tournaments access controller.

The roadmap states that tournament access expires after a 24-hour absolute limit or two hours of inactivity.

The stored session entry contains grantedAt, expiresAt, and version. hasSessionTournamentAccess checks only:

    sessionAccess.expiresAt > now
    sessionAccess.version === current access version

No last-active timestamp is stored or refreshed and no two-hour inactivity check exists.

Thus an access grant can remain valid for essentially 24 hours after the last use.

Password rotation still invalidates old sessions through the version check, which is a positive control.

### P5-07 — MEDIUM: tournament user management leaks a user's memberships in other tournaments

Status: confirmed cross-tournament metadata disclosure.
Area: controllers/tournament-users.ts.

An organizer administering tournament A can add an existing global username to A. The response serializer returns:

    userId
    username
    role for the current membership
    tournaments: user.tournaments

user.tournaments is the complete legacy/global list of tournament IDs for that user, not just tournament A.

The remove endpoint similarly returns all remaining tournament IDs.

Therefore an organizer who knows another user's username can add that account to their tournament and learn identifiers of unrelated tournaments to which the account belongs, including tournaments omitted from the public tournament list.

No passwordHash is leaked, and this does not by itself grant access to those other tournaments, but the response exceeds the caller's tournament scope.

Recommended response: return only current-tournament membership information; global membership summaries should be self/superuser data.

### P5-08 — MEDIUM hardening: tournament access password attempts use only the generic API limiter and have no password-strength floor

Status: confirmed configuration gap; practical severity depends on organizer password choices.
Area: app.ts, tournament access route/schema.

POST /tournaments/:id/access is not under the stronger /auth limiter. It receives only the generic API/IP limits (default API limit is much higher than the authentication-specific limit).

Tournament auth input is accepted through a generic auth record; mergeTournamentAuth requires only a non-empty string for the access password, with no minimum length/entropy requirement.

A weak tournament password is therefore exposed to a relatively permissive online guessing surface.

This is secondary to P5-01 because public tournaments currently do not require Access at all, but it matters for protected tournaments.

### P5-09 — LOW: audit tournament-id fallback has an accidental discarded expression

Status: confirmed low-impact logic bug.
Area: middleware/audit-log.ts.

resolveTournamentId contains:

    const fromRequest =
      getRequestValue(req, 'tournamentId') ??
      getRequestValue(req, 'id')
      getResponseDataValue(responseBody, 'tournamentId')

Because there is no nullish-coalescing operator before the final function call, JavaScript parses the last call as a separate expression statement. Its return value is discarded.

This is syntactically valid, which is consistent with the successful current-main CI run, but the intended response-body fallback is not part of fromRequest.

Most audited mutation routes already carry tournamentId in request params/body, and tournament.create has a special response fallback, so the observed security effect is low. It can nevertheless cause missing tournament attribution for future/edge audit events that rely on response data.

### P5-10 — LOW/spec reconciliation: public response DTOs have intentionally drifted from the older written allowlist

Status: not classified as a vulnerability without a newer product decision.

The original security roadmap public allowlist is narrower than current DTO behavior. Current code/tests intentionally expose some participant-facing fields such as:

- selected tournament style overrides;
- participant-safe Round.userDefinedData flags;
- teamAllocationOpened/adjudicatorAllocationOpened;
- adjudicator allocation while team draw is closed if allocationOpened is true.

These values are needed by current participant workflows and have explicit unit/integration coverage. This appears to be product evolution rather than an accidental leak.

The roadmap should be updated so future audits do not mistake intentional participant data for exposure.

### Items investigated and rejected/reduced

1. Audit-log global leak: route-level middleware is only requireAuth, but listAuditLogs performs a controller-level authorization check. Non-superusers must provide tournamentId and must pass hasTournamentAdminAccess for that tournament. No cross-tournament audit-log read was established.

2. Basic entity IDOR: team/speaker/adjudicator/venue/institution get/update/delete operations use tournament-scoped models/filters and update/delete filters include both _id and tournamentId. Existing boundary tests also exercise foreign IDs. No direct cross-tournament object read/write was established.

3. Mixed-tournament bulk payload bypass: requireTournamentAdmin derives the tournamentId from the first array item, but the shared CRUD controller then requires every item to have the same tournamentId before mutation. No mixed-ID privilege bypass was found.

4. Hidden tournament direct URL: user_defined_data.hidden removes a tournament from the participant public list. The current user manual defines the setting as list visibility, not as an access-control boundary. Direct-by-ID access is therefore treated as unlisted behavior, not a confirmed authorization bug.

5. Raw-results public exposure: older roadmap text describes requireTournamentAccess on raw-result GETs, but current routes use requireTournamentAdmin for raw team/speaker/adjudicator result endpoints. No current public raw-result leak was found.

6. /api versus /api/v1 drift: both namespaces are mounted through the same createRoutes() factory and share the same authentication, scope, rate-limit, parsing, and idempotency middleware. Legacy /api only adds deprecation/sunset headers. No current handler-level security divergence was found.

7. Superuser self-registration: explicitly blocked in the register controller.

8. Tournament-admin membership revocation: requireTournamentAdmin queries current TournamentMember state rather than trusting a stale session tournament list, so removal takes effect on subsequent admin checks.

### Positive controls worth preserving

- Tournament-admin writes are generally scoped to current TournamentMember organizer membership.
- Service-account tournament_ids are checked when deriving tournament membership/admin authority.
- Public entity responses use explicit sanitizers rather than raw document passthrough.
- Tournament access password rotation increments access.version and invalidates old access-session versions.
- Sensitive privacy operations require tournament admin and reauthentication.
- Audit-log reads perform their own tournament-admin check.
- Submission duplication is backed by a database unique index, containing simple request races.
- /api and /api/v1 currently share one router factory, avoiding duplicated authorization implementations.

### Remediation priority for the later fix phase

1. Lock global Style mutations to a platform/superuser boundary or redesign styles as tenant-owned immutable/versioned resources.
2. Split requireTournamentAccess from requireTournamentView and enforce a real access grant on submission writes.
3. Introduce authenticated entity binding/capabilities for ballot and feedback submitters.
4. Restrict service-token revocation/listing to platform authority or a real organization boundary.
5. Hash tournament access passwords on the write path and eliminate newly persisted plaintext.
6. Restore/document inactivity expiration for tournament-access sessions.
7. Remove cross-tournament membership lists from tournament-admin user-management responses.
8. Add access-password-specific throttling/password policy.
9. Repair the audit fallback expression and update public DTO documentation.

### Phase 5 conclusion

Phase 5 found two separate classes of serious authorization defects:

- tenant-boundary failures: a self-registered organizer can mutate global styles and can globally revoke service tokens;
- participant-write identity failures: public visibility currently satisfies submission Access, and submittedEntityId is not cryptographically/authentically bound to the requester.

The global Style mutation is the strongest Phase-5 finding because it gives an arbitrary self-registered organizer a direct path to alter scoring/style behavior used by tournaments they do not administer.

The access-control roadmap also reveals two regressions from previously marked-complete security work: View and Access have collapsed back into the same predicate, and newly supplied tournament access passwords are again persisted as plaintext until startup maintenance.


## Phase 6 — ballot / compile / ranking / export consistency audit

### Scope and method

Phase 6 traced the tournament-result data path end to end:

    ballot / feedback submission
      -> submission normalization + dedupe
      -> submission-to-raw adaptation
      -> core round aggregation
      -> compiled team/speaker/adjudicator results
      -> ranking
      -> saved compiled snapshots
      -> CSV / ZIP report exports

The audit focused on recomputation after corrections, missing and duplicate data, scoreless rounds, ties, selected-round subsets, historical snapshots, and consistency between submission-source and raw-source compilation.

No production code was changed in this phase.

### P6-01 — HIGH: missing_data_policy does not detect an entirely missing ballot/matchup

Status: confirmed result-integrity bug.
Area: packages/server/src/controllers/compiled.ts.
Impact: a tournament can be compiled and saved with an entire drawn matchup missing, even when missing_data_policy='error'; teams in that matchup can disappear from the standings without a server error.

The reports UI correctly knows how many ballots are expected from each draw and displays:

    expected
    submitted
    missing
    duplicates
    unknown

using buildRoundSubmissionCoverage.

The server-side compiler does not use that expected-submission model. Its MissingDataIssue collection is populated only while iterating submissions that already exist. Registered issues cover cases such as:

    invalid round inside an existing submission
    invalid matchup inside an existing submission
    non-finite score
    missing winner/verdict
    missing speaker id for a scored slot
    invalid feedback

There is no draw-versus-submission sweep that says "this expected matchup has no ballot."

This is particularly dangerous because the submission compiler constructs teamInstances from teamIdsWithResults. If Match B has no ballot at all, its teams are not merely marked incomplete; they are absent from the compiled result set.

The current default compile option is missing_data_policy='error', and the user manual describes error-stop as the safe production choice. That guarantee is therefore incomplete.

Minimal regression case:

1. Create one round with two drawn matchups: A-B and C-D.
2. Submit a valid ballot only for A-B.
3. Compile selected round with source='submissions' and missing_data_policy='error'.
4. Expected: HTTP 400 identifying missing ballot(s) for C-D.
5. Current behavior: no missing-data issue is generated from the absent matchup; compilation can proceed using only the submitted matchup.

The same conceptual gap exists in raw-source compilation: compile_options retains missing_data_policy but the raw builder emits compile_warnings: [] and does not enforce completeness against the draw.

Recommended fix: derive expected ballot keys from selected draws and round submission rules on the server, reconcile them with normalized submissions before aggregation, and feed absent expected keys through the same warn/exclude/error policy. Server enforcement is required even if the UI also displays coverage.

### P6-02 — HIGH: scoreless rounds can be converted to numeric zero tiebreak values and distort mixed-round rankings

Status: confirmed aggregation/source-consistency bug.
Area: packages/server/src/controllers/compiled.ts + packages/core/src/results/results.ts.
Impact: legitimate no_speaker_score rounds, byes, or other rounds with null score-derived metrics can inject artificial zeroes into aggregate score/margin statistics; mixed scored + scoreless tournaments can receive incorrect tiebreak values and rankings.

There are two interacting problems.

First, raw-source compilation already distinguishes whether speaker-score data exists:

    if mappedRawSpeakerResults and speakerInstances exist:
        compileTeamResults(full speaker integration)
    else:
        compileTeamResults(simple team-only mode)

Submission-source compilation does not make that distinction. As long as there is a team result, it calls the full speaker-integration overload even when mappedRawSpeakerResults is empty.

A legitimate round with userDefinedData.no_speaker_score=true therefore has team results but no speaker results. Speaker integration correctly produces null score-derived round metrics. The next aggregation step then does:

    Number(result.sum ?? 0)
    Number(result.margin ?? 0)
    Number(result.opponent_average ?? 0)

and pushes those zeroes into aggregate arrays.

Consequences:

- an all-scoreless submission compile reports numeric zero score/margin fields where raw-source/simple compilation reports null/non-applicable fields;
- in a mix of scored and scoreless rounds, the scoreless round participates as an artificial zero in averages and other score-derived tiebreak summaries;
- default ranking priority includes win, sum, margin, so the distortion can change final ordering when win totals tie;
- bye rounds whose integrated margin/opponent_average is intentionally null can similarly dilute average_margin/opponent_average by contributing zero.

This behavior bypasses missing_data_policy because scoreless rounds are legitimate, not malformed submissions.

Recommended fix:
1. Make submission-source and raw-source mode selection consistent.
2. In core aggregation, preserve null/non-applicable metrics rather than coercing them to zero.
3. Aggregate each metric over rounds in which that metric is actually defined, with an explicit policy for mixed score/no-score tournaments.
4. Add cross-source parity tests for no_speaker_score and mixed scored/scoreless rounds.

### P6-03 — MEDIUM: compiled vote_rate is mathematically wrong

Status: confirmed core aggregation bug.
Area: packages/core/src/results/results.ts.

At round level, vote_rate is a vote/win fraction in [0, 1].

For a two-team round, the code keeps both:

    vote      = signed vote difference (wins - losses)
    vote_rate = wins / ballots

At compiled level it accumulates signed vote values into votes[id], accumulates ballot counts into accs[id], then computes:

    vote_rate = votes[id] / accs[id]

That is a signed margin rate in [-1, 1], not the round-level vote fraction.

Minimal example:

    ballot 1: win  -> vote = +1
    ballot 2: loss -> vote = -1
    acc = 2

Correct aggregate vote_rate = 1 / 2 = 0.5.
Current compiled vote_rate = (+1 - 1) / 2 = 0.

The same mismatch applies to fractional/tied voting because the round representation centers vote around zero while vote_rate remains an ordinary fraction.

Current tests assert compiled vote in several cases but do not assert compiled vote_rate.

Recommended fix: accumulate vote wins/fractions directly (e.g. result.vote_rate * result.acc) and divide by total acc, or algebraically convert signed vote difference back to a fraction. Add 1-0, 0-1, 1-1 split, and fractional-tie regression cases.

### P6-04 — MEDIUM: duplicate merge_policy='average' can attribute averaged scores to the wrong speakers

Status: confirmed historical/imported-data correctness bug.
Area: packages/server/src/controllers/compiled.ts.
Impact: speaker rankings / Best / POI attribution can be wrong when duplicate ballots from the same actor contain different speaker selections.

mergeAverageBallotGroup averages score, matter, manner, Best, POI, and winner information across all duplicate payloads.

Speaker IDs are not merged with the same semantics. The implementation chooses the first duplicate payload that contains non-empty speaker IDs:

    speakerIdsA = first non-empty speakerIdsA
    speakerIdsB = first non-empty speakerIdsB

and then attaches the averaged score arrays to those IDs.

Example:

    duplicate 1 slot 1: Speaker X = 75
    duplicate 2 slot 1: Speaker Y = 80

The merged row can become:

    Speaker X = 77.5

even though half of that score belonged to Y.

The normal submission API now prevents same-actor duplicates, but duplicate normalization is explicitly a supported compile feature for historical/imported/manual data, and the integration suite manually creates duplicate rows to test it. The existing duplicate-average test uses identical speaker IDs across duplicates, so this mismatch case is uncovered.

Recommended behavior: if speaker identities differ across duplicates, either reject average mode for that group, warn and fall back to latest, or aggregate per speaker identity rather than per positional slot.

### P6-05 — MEDIUM: historical compiled snapshots are exported together with live submissions, draws, and entity metadata

Status: confirmed report-provenance inconsistency.
Area: packages/web/src/views/admin/AdminTournamentCompiled.vue and detailed-results-export.ts.
Impact: a downloaded report bundle can combine historical aggregate rankings with current/corrected ballot details that did not produce those rankings.

The compiled-history UI can select and display an older immutable compiled snapshot. Ranking CSVs are generated from that selected compiled payload.

However:

    detailedResultsExportRows
      = buildDetailedResultsExportRows(submissions.submissions, ...)

where submissions.submissions is the current live submission store fetched from the server.

The detailed export also resolves:

    round names from current round records
    team/speaker/adjudicator names from current entity records
    ballot side from current draws

not from snapshot-time state.

The bulk ZIP then combines:

    ranking CSVs from selected compiled snapshot
    participant CSV from current entities
    all_round_results.csv from current submissions

Additionally, all_round_results.csv is not restricted to the rounds contained in the selected compiled snapshot.

Therefore this sequence is possible:

1. Save Snapshot S from rounds 1-3.
2. Correct a ballot, edit an entity name, alter a draw, or add round 4 submissions.
3. Re-open historical Snapshot S.
4. Download the bulk ZIP.
5. Ranking files represent S, while detailed vote rows/entity labels/draw sides represent the current database and may include round 4.

The detailed vote CSV compounds the provenance problem by exporting only submitted_at=createdAt; it has no updated_at column, so a corrected ballot carries the original submission timestamp with current contents and no visible correction timestamp. The separate comment-sheet exporter already includes both created_at and updated_at, showing the data is available.

Recommended fix: either snapshot the raw provenance required for a report, or label detailed/live files explicitly and restrict them to the selected snapshot rounds. At minimum include updated_at and a generated-at/current-data warning; for archival correctness, store submission version/IDs or immutable input material with the compiled snapshot.

### P6-06 — MEDIUM: compiled speaker affiliation collapses round-specific team membership to the first team encountered

Status: confirmed presentation/export metadata bug.
Area: packages/server/src/controllers/compiled.ts.
Impact: speaker result rows, speaker CSVs, award slides, POI/Best displays can show an incorrect or incomplete team when a speaker's team membership differs by round.

The team model explicitly supports round-specific details[].speakers, and submission validation uses round-specific speaker ownership.

Both raw and submission compilation build speaker metadata approximately as:

    for each team:
      collect speaker IDs from all team.details
      if speakerMeta does not already contain speaker:
          speakerMeta[speaker] = this team

The compiled speaker result then emits only:

    teams: [speakerMeta[speaker].teamName]

Thus a speaker who appears for Team A in one selected round and Team B in another is permanently labeled with whichever team happened to be encountered first.

This does not alter the speaker's numeric score computation, but it makes exported/presented affiliation inconsistent with the round-level data model.

Recommended fix: collect the set of teams associated with each speaker over the selected compile rounds, or carry round-specific team attribution into the result DTO.

### P6-07 — MEDIUM/LOW: stale-preview protection is optional at the API boundary

Status: confirmed consistency-guard gap; normal current UI uses the guard correctly.
Area: routes/compiled.ts + controllers/compiled.ts.

The current reports UI follows the intended workflow:

    preview
    -> store preview_signature + revision
    -> save with both tokens
    -> server rebuilds and rejects stale tokens

That path is good.

But POST /compiled defines both fields as optional:

    preview_signature: optional
    revision: optional

and server validation compares a token only if a non-empty token was supplied. If both are omitted, the save is accepted.

This means direct API clients, older clients, or alternative UI paths can bypass the "what I previewed is what I save" invariant. The server recompiles current data, so it does not persist a stale calculation; instead it can persist a result the caller never previewed.

If backward compatibility is still required on legacy /api, the stronger contract can be introduced on /api/v1 while temporarily retaining legacy behavior.

### P6-08 — LOW: detailed result exports hide correction time

Status: confirmed export-provenance weakness; closely related to P6-05.
Area: packages/web/src/utils/detailed-results-export.ts.

DetailedResultsExportRow has submitted_at but no updated_at. createBaseRow sets submitted_at from submission.createdAt.

An organizer correction updates the payload and updatedAt but preserves createdAt. The detailed vote export therefore presents corrected contents under the original submission timestamp with no way to distinguish that correction from the original ballot.

The comment-sheet exporter already exports both created_at and updated_at. Detailed result exports should do the same.

### Items investigated and rejected/reduced

1. Submission dedupe after administrator correction: not a bug. updateSubmission re-normalizes the edited payload and round, recomputes dedupeKey, and persists the new key. The unique index is correctly scoped by tournamentId + round + type + dedupeKey, so the same actor/matchup can legitimately submit again in a later round.

2. score_weights apparent "missing multiplication": not classified as a bug. UTab styles use score ranges and weights with legacy normalization semantics (for example reply speeches can already be stored on a half-scale). Simply multiplying each score by its weight would change those semantics. This requires a deliberate scoring-model redesign, not a bug patch.

3. Normal ballot winner absence: current public/admin ballot normalization requires winnerId or an allowed draw. Missing-winner handling in compilation remains relevant for imported/legacy/manual rows but is not a normal new-submission path.

4. Preview staleness in the current reports UI: current UI does pass preview_signature and revision and marks changed compile inputs stale before save. P6-07 concerns the server/API invariant, not the primary UI workflow.

5. Dedupe race: the database unique index backs the application-level duplicate precheck, so concurrent duplicate submissions are ultimately contained.

### Positive controls worth preserving

- Ballot creation validates team membership, score ranges/units, speaker ownership by round, draw publication, winner/draw rules, and array lengths.
- Administrator submission edits re-run ballot/feedback normalization rather than writing arbitrary payloads directly.
- Submission dedupe keys are protected by a compound unique index that includes round.
- Compile snapshots store the selected rounds, source, normalized compile options, and diff-baseline metadata.
- Current reports UI uses preview signatures/revisions and blocks stale preview saves in its normal path.
- Explicit compiled diff baselines are tournament-scoped.
- Core integration correctly preserves repeated speaker slots for formats where one speaker fills multiple speaking positions.
- CSV escaping includes spreadsheet-formula protection through the shared CSV helper.

### Remediation priority for the later fix phase

1. Server-side expected-ballot completeness reconciliation for every selected draw/round; make missing_data_policy actually cover absent matchups.
2. Remove null-to-zero score/margin coercion and make submission/raw compilation agree for no_speaker_score and mixed-score rounds.
3. Fix compiled vote_rate mathematics and add direct regression tests.
4. Make historical report exports snapshot-consistent, or clearly separate live provenance from immutable snapshot data.
5. Define safe behavior for average-merging duplicates whose speaker identities differ.
6. Preserve multi-team/round-specific speaker affiliation in compiled DTOs.
7. Require preview/revision tokens on the canonical save API if preview-save consistency is intended as a server invariant.
8. Add updated_at to detailed vote exports.

### Phase 6 conclusion

Phase 6 found two result-affecting defects that should be treated above ordinary UI bugs:

- missing_data_policy='error' does not protect against an entire expected matchup being absent;
- legitimate null/non-applicable score metrics can be coerced to zero, creating submission/raw divergence and potentially changing score/margin tiebreak ordering across mixed scored/scoreless rounds.

It also found a mathematically incorrect compiled vote_rate and several archival/report-provenance issues that can make historical snapshot exports disagree with the ballots and metadata shown alongside them.


## Phase 7 — Web state, races, and API-contract audit

### Scope and method

Phase 7 traced the Vue/Pinia side of the application with emphasis on state ownership rather than visual polish:

    route params
      -> page refresh orchestration
      -> Pinia fetch/mutation lifecycle
      -> shared arrays
      -> API request/response contracts
      -> loading/error state
      -> user-visible actions

The audit specifically looked for:

- stale responses overwriting newer route state,
- cross-tournament state contamination,
- mutation-versus-navigation races,
- double submit / timeout ambiguity,
- swallowed API errors,
- frontend/server schema drift,
- loading overlays that still permit actions on stale data,
- and assumptions that a store contains only the current tournament.

No production code was changed in this phase.

### P7-01 — HIGH: AdminRoundResult can permanently bind the room summary to another tournament's draw

Status: confirmed cross-tournament state bug.
Area:
- packages/web/src/stores/draws.ts
- packages/web/src/views/admin/round/AdminRoundResult.vue

The draw store intentionally behaves differently for a round-scoped fetch. When fetchDraws(tournamentId, round) is used, it preserves draw rows belonging to other tournaments while replacing only the requested tournament/round slice.

AdminRoundResult performs exactly that round-scoped fetch:

    draws.fetchDraws(tournamentId.value, round.value)

but selects the draw with:

    draws.draws.find((draw) => Number(draw.round) === round.value)

It does not constrain by tournamentId.

This is not merely a transient old-response race. If the store contains:

    Tournament A / Round 1
    Tournament B / Round 1

the round-scoped merge can retain both. Because other-tournament rows are retained ahead of the newly merged tournament rows, find(round === 1) can continue returning Tournament A's Round 1 even after Tournament B's fetch has completed successfully.

The resulting roomOrderSummaries then combine:

- Tournament A's draw/allocation,
- Tournament B's raw results,
- Tournament B's team/adjudicator/venue stores.

Names can fall back to raw IDs when the A IDs do not exist in B. More importantly, the administrator is being shown the wrong room/matchup structure while editing B's raw results.

Minimal regression case:

1. Open Tournament A, Round 1 raw results so the draw store contains A/R1.
2. Navigate to Tournament B, Round 1 raw results without a full draw-store reset.
3. Let the B round-scoped fetch complete.
4. Expected: drawForRound is B/R1.
5. Current selector: first row whose round is 1, which can be A/R1.

Recommended fix:
- every selector over shared/multi-tournament draw state must key on both tournamentId and round;
- preferably expose a store helper such as getDraw(tournamentId, round) so components cannot accidentally use round as a globally unique key;
- add a two-tournament regression test with the same round number.

### P7-02 — HIGH/MEDIUM: entity mutations can invalidate the new tournament's fetch and inject the old tournament into single-tournament stores

Status: confirmed mutation/navigation race pattern.
Area: multiple current-tournament Pinia stores, including teams, speakers, adjudicators, venues, institutions, and rounds.

These stores correctly protect fetch-versus-fetch races with a latestFetchSequence. The mutation methods use the same sequence counter, however, and mutate the current array without verifying that the route/store context still belongs to the mutation's tournament.

A representative create race is:

1. On Tournament A, call createTeam(A, ...). Request remains in flight.
2. Navigate to Tournament B.
3. fetchTeams(B) starts and captures sequence N.
4. A's create request resolves.
5. createTeam calls advanceFetchSequence(), making the sequence N+1, then unshifts the new A team into teams.value.
6. fetchTeams(B) resolves with its older sequence N and is discarded as stale.
7. The Tournament B screen can now hold Tournament A team rows until another successful refresh.

This is worse than an ordinary late-response race because the mutation itself deliberately invalidates the correct B fetch.

The same structural problem exists in several entity stores that model "the current tournament" as one global array while allowing outstanding mutations from a previous tournament.

Update/delete operations can similarly invalidate the new fetch even when the old entity ID does not match anything in the new array. Creates are the clearest contamination case because they actively insert the old-tournament object.

Recommended fix:
- capture the mutation tournamentId and only apply local state if the store is still scoped to that tournament;
- alternatively make entity state keyed by tournamentId rather than one global array;
- do not use a mutation from tournament A to invalidate an in-flight fetch for tournament B;
- add deterministic deferred-promise tests covering create(A) -> fetch(B) -> create(A) resolves -> fetch(B) resolves.

### P7-03 — MEDIUM: participant home has a page-level refresh race that can expose stale tournament data while the new tournament is loading

Status: confirmed orchestration race.
Area: packages/web/src/views/user/participant/UserParticipantHome.vue.

Most individual stores have fetch sequence protection, but the page-level refresh lifecycle does not.

On tournament/mode change the watcher does:

    hasLoaded = false
    refresh()

refresh() has no request token and unconditionally executes:

    finally {
      hasLoaded = true
    }

Therefore an older refresh for Tournament A can finish after a newer refresh for Tournament B has started and set hasLoaded=true for the B route.

The template then stops showing the blocking initial LoadingState because:

    LoadingState if !hasLoaded && isLoading
    page body otherwise

When hasLoaded is prematurely true while B is still loading, the previous store arrays can be rendered beneath a reload overlay. The overlay explicitly has:

    pointer-events: none

so links/buttons underneath remain interactive.

A concrete sequence is:

1. A page has A rounds/draws in stores.
2. Navigate quickly to B.
3. B fetches start; A's older refresh finishes and sets hasLoaded=true.
4. Before B fetches finish, the B URL can render A round/draw content.
5. Action links are generated with the B tournamentId but A entity/match IDs.

The server should reject many malformed cross-tournament actions, so this is primarily a UI state-integrity bug rather than a server isolation bypass. It can nevertheless send users into invalid ballot/feedback flows and display the wrong draw.

Recommended fix:
- use createLatestRequestGate or an equivalent captured tournament token around the whole page refresh;
- clear or explicitly scope current-tournament arrays on route change;
- make a loading overlay that is meant to prevent actions actually intercept pointer input;
- test A -> B navigation with A completing after B starts.

### P7-04 — MEDIUM: raw-result create/update/delete failures are swallowed, refreshed away, and can look successful

Status: confirmed error-contract bug.
Area:
- packages/web/src/stores/raw-results.ts
- packages/web/src/views/admin/round/AdminRoundResult.vue

The raw-results store intentionally catches API failures and returns null:

    createRawResults(...) -> null on API error
    updateRawResult(...) -> null on API error
    deleteRawResult(...) -> null on API error

It also stores the server message in raw.error.

The view treats those calls as if failures would throw.

For create:

    await raw.createRawResults(...)
    await refresh()

For update:

    await raw.updateRawResult(...)
    await refresh()
    cancelEdit()

For single delete:

    await raw.deleteRawResult(...)
    await refresh()

Because the store swallowed the exception, the view continues after a null result. refresh() immediately calls fetchRawResults, and each fetch begins with:

    error.value = null

Thus the original mutation error can disappear before the user sees it.

For update, the editor is also closed even when the update failed.

The surrounding catch blocks mainly catch JSON.parse errors, not the API errors the author appears to expect.

The bulk delete path is a useful positive contrast: confirmDeleteAll checks the returned value before refresh and preserves the error.

Recommended fix:
- check the returned mutation value before refreshing/closing;
- or standardize store mutation contracts to throw and let views catch;
- never reuse one error ref in a way where an automatic follow-up GET erases the failed mutation's message;
- add tests for 400/409/500 on create/update/delete and verify editor state/error text remains visible.

### P7-05 — MEDIUM: browser ballot/feedback timeout can report failure after the server has committed the submission

Status: confirmed ambiguous-outcome failure mode.
Area: packages/web/src/stores/submissions.ts.

Participant submission POSTs are wrapped in a 15-second AbortController timeout.

When the client aborts it returns null and reports a timeout message. Client cancellation, however, does not provide transaction rollback semantics at the server. The server may already have committed the submission while the response is delayed or lost.

A user can therefore observe:

1. POST reaches the server and is committed.
2. Response does not reach the browser before 15 seconds.
3. UI reports "通信がタイムアウトしました".
4. User retries.
5. The dedupe unique constraint rejects the retry as an already submitted ballot/feedback.

The database uniqueness protection is good for integrity but does not resolve the user-visible uncertainty: the first submission may actually be the accepted record.

Recommended fix:
- use a client-generated idempotency/request key for participant submissions, or
- after an ambiguous timeout, reconcile by querying the actor/match submission state before telling the user to retry;
- distinguish an idempotent replay from a genuine conflicting duplicate.

### P7-06 — MEDIUM: in-flight Tournament A settings saves can overwrite Tournament B's local form after navigation

Status: confirmed local-state race.
Area: packages/web/src/views/admin/AdminTournamentHome.vue.

The page has a good refreshGate for reads, but mutation completions are not tied to the tournament that is still being displayed.

For example saveTournament captures A in the request, awaits updateTournament(A), then unconditionally does:

    applyAccessForm(updated.auth, ...)
    tournamentAutosaveStatus = 'saved'

The tournamentId watcher clears pending timers and flags, but it cannot cancel an already in-flight save and there is no post-await check that:

    tournamentId.value === updated._id

The specialized break/team-ranking/adjudicator-ranking saves have the same pattern and Object.assign the returned configuration directly into shared form objects after await.

Possible sequence:

1. Save A settings.
2. Navigate to B while request is in flight.
3. B refresh applies B forms.
4. A save resolves later.
5. A's access/break/ranking values are written into the B screen.

A subsequent B edit/save can then persist values copied from A if the user does not notice.

Recommended fix:
- capture currentTournamentId before every mutation and discard UI-side completion effects when the route no longer matches;
- optionally cancel obsolete browser requests, but still keep the post-await identity check;
- apply the same mutation gate pattern used for reads.

### P7-07 — MEDIUM: the server/core support N-team allocations, but the Web draw contract and editor collapse to a two-team gov/opp model

Status: confirmed API/frontend contract mismatch for non-two-team styles.
Area:
- packages/core/src/allocations/teams.ts
- packages/server/src/controllers/allocations.ts
- packages/server/src/routes/draws.ts
- packages/web/src/types/draw.ts
- packages/web/src/views/admin/round/AdminRoundAllocation.vue
- other Web draw consumers.

The core allocator is explicitly parameterized by:

    config.style.team_num

and standard/random allocation can emit square.teams arrays of that size.

The server preserves this: mapAllocationOut converts exactly two teams into:

    { gov, opp }

but leaves larger team arrays as arrays.

The draw route also accepts broader team shapes, including arrays and four-team forms.

The Web type declares only:

    teams: { gov: string; opp: string }

and AdminRoundAllocation is structurally two-team in many places:

    row.teams.gov
    row.teams.opp
    validAllocationRowCount => gov && opp
    import template => gov,opp
    unassigned-team logic => gov/opp only

The page is aware that team_num can differ from two—it computes normalizeTournamentTeamNum(style.team_num) and only disables one specific algorithm for non-two-team styles—but the main allocation state remains DrawAllocationRow[] with the two-team shape.

For team_num=4, a successful server team-allocation response can contain:

    teams: [team1, team2, team3, team4]

which violates the frontend type and leaves gov/opp reads undefined.

Participant ballot submission being intentionally limited to two-team styles is not the issue here; that limitation is explicit in both UI and server. The problem is that the admin draw/allocation API advertises and produces a broader shape than the admin Web editor can faithfully represent.

The user manual also describes selecting BP/PDA-style formats, so this should not be treated as an impossible internal-only shape.

Recommended fix:
- define a shared discriminated allocation-team shape derived from team_num/positions;
- make admin draw rendering/editing generic over configured positions;
- or explicitly reject non-two-team tournament creation/admin allocation until the Web surface supports it, rather than accepting a shape the UI cannot operate on.

### P7-08 — LOW: RoundBreakConfig type omits a field required by the server break endpoint, and CI typechecking cannot catch the existing violating test call

Status: confirmed latent type-contract drift.
Area:
- packages/web/src/types/round.ts
- packages/web/src/stores/rounds.ts
- packages/server/src/routes/rounds.ts
- packages/web/src/stores/workflow-ui.test.ts
- packages/web/tsconfig.typecheck.json

The Web type RoundBreakConfig does not contain:

    enabled: boolean

but the server breakConfigSchema requires enabled.

The rounds store exposes saveBreakRound with:

    breakConfig: RoundBreakConfig

and sends it to the server.

The workflow integration test actually calls saveBreakRound with:

    enabled: true

which is outside the declared TypeScript type.

This mismatch is not detected by normal Web typechecking because tsconfig.typecheck.json excludes test/spec files.

A production caller of saveBreakRound using only the declared type can therefore construct a payload the server rejects.

No production call to this store helper was found in the current source, so this is classified as a latent contract bug rather than an active user workflow defect.

Recommended fix:
- make the frontend request type match the server schema exactly;
- keep persistent round-break config and break-endpoint request DTO separate if their shapes differ;
- add contract/type tests that are included in CI, rather than relying on test files excluded from vue-tsc.

### P7-09 — LOW/MEDIUM: current-tournament stores retain the previous tournament's successful data when the next fetch fails

Status: confirmed state-lifetime weakness; amplifies P7-02/P7-03.
Area: teams/speakers/adjudicators/venues/institutions/rounds and similar stores.

The fetch methods generally:

1. set error=null,
2. request the new tournament,
3. replace the array only on success,
4. set error on failure,

but do not clear the old tournament array when switching scope.

This is sometimes masked by page-level error branches or loading gates, but it means "store contains current tournament data" is not itself an invariant. Components that continue to render, computed selectors that are not tournament-filtered, and mutation code can still observe the old array.

This state model is the enabling condition for several cross-tournament bugs above.

Recommended fix: track the tournamentId associated with each current-scope store payload and expose data only when it matches the requested scope, or key cached state by tournamentId.

### Items investigated and rejected/reduced

1. Simple fetch-vs-fetch races in teams/speakers/adjudicators/venues/rounds: the per-store latestFetchSequence mechanism generally prevents an older GET response from replacing a newer GET response. The larger problems arise when mutations share/invalidate that sequence across tournament scopes, or when page-level loading state is not similarly gated.

2. Ballot/feedback double-click submission: the participant confirmation buttons use submissions.loading in their disabled/loading state and a countdown, so ordinary rapid double-clicks are guarded. P7-05 concerns ambiguous network completion, not a missing button lock.

3. AdminRoundOperationsHub read orchestration: it uses createLatestRequestGate for the page refresh plus separate gates for submissions/history/auto-preview. Its read-side tournament switching is materially safer than UserParticipantHome.

4. AdminTournamentHome read refresh: it captures the tournament ID and uses refreshGate before applying the form, so stale GET completions are guarded. P7-06 is specifically about mutation completions.

5. Compiled frontend/server option definitions: packages/web/src/types/compiled.ts and packages/server/src/types/compiled-options.ts currently match closely, including defaults. No Phase-7 mismatch was found there.

6. Raw-result bulk delete: unlike single create/update/delete, the view checks the returned value before refresh and preserves failure state.

### Positive controls worth preserving

- createLatestRequestGate is small, understandable, and already used effectively in several complex admin screens.
- Most entity fetches have a sequence guard, which blocks the common "slow old GET overwrites fast new GET" race.
- AdminRoundOperationsHub and AdminRoundAllocation have substantially better whole-page refresh gating than older/simple pages.
- Participant ballot and feedback confirmation buttons are disabled while the submission store is loading.
- Server-side tournament scoping and submission dedupe remain the final integrity boundary for several UI races; the Web issues found here do not by themselves bypass server authorization.
- The compiled store separately sequences latest-result and preview requests and invalidates stale previews on save/delete paths.
- Bulk raw-result deletion handles a failed mutation explicitly; that pattern should be reused for single mutations.

### Remediation priority for the later fix phase

1. Fix every draw selector to use the compound key (tournamentId, round), starting with AdminRoundResult.
2. Introduce explicit tournament scoping into current-entity stores so old-tournament mutation completions cannot invalidate/contaminate new-tournament fetches.
3. Add a page-level latest-request gate to UserParticipantHome and prevent interaction with stale content while reloads are active.
4. Fix raw-result mutation contracts so failed create/update/delete operations remain visible and do not close/refresh as success.
5. Add mutation-completion route guards to AdminTournamentHome.
6. Add submission timeout reconciliation/idempotency for ambiguous POST outcomes.
7. Decide whether non-two-team Web allocation is supported; then either implement a generic team-position shape or explicitly reject unsupported styles at the UI/API boundary.
8. Align RoundBreakConfig/request DTOs and bring contract type tests under CI.
9. Make store payload scope explicit so a failed fetch cannot leave old data masquerading as current data.

### Phase 7 conclusion

Phase 7 found that UTab's read-side race handling is uneven rather than absent: several stores and newer admin screens use good sequence/gate patterns, but tournament scope is not encoded strongly enough in shared state.

The most concrete defect is AdminRoundResult selecting a draw by round number alone even though the draw store can intentionally contain multiple tournaments. A second systemic problem is that late mutations from Tournament A can invalidate Tournament B's correct fetch and insert A objects into current-tournament stores.

The remaining findings show the same architectural theme: route identity, request identity, and stored-data identity are often tracked separately rather than as one compound state invariant. Encoding tournamentId into store scope/selectors and applying the existing latest-request-gate pattern to mutations would remove several classes of bugs at once.


## Phase 8 — Recent-change regression audit

### Scope and method

Phase 8 reviewed the recent workflow-heavy change series rather than auditing the current tree as if every defect were equally old.

The main change sets examined were:

- PR #29 / 02928dd — Improve tournament ops UI and allocation handling
- PR #30 / 415b86d — Clarify priority order and sort venue allocation
- PR #31 / a866527 — Improve tournament workflow and result exports
- PR #32 / d419cce — Improve ballot workflow and allocation warnings
- PR #33 / b05f06d — Implement Gmail-requested UTab improvements

For each change set the audit followed:

    changed assumption
      -> impacted invariant
      -> current implementation
      -> tests added with the change
      -> missing counterexample

This phase intentionally distinguishes:

1. defects introduced by a recent change;
2. old defects made reachable or more likely by a recent change;
3. intentional behavior changes that lack migration/backward-compatibility handling;
4. areas reviewed where no high-confidence regression was found.

No production code was changed in this phase.

### P8-01 — HIGH: PR #33's round renumber/delete lifecycle is non-atomic across many collections and can leave a tournament partially destroyed

Origin: PR #33 / b05f06d.
Status: confirmed recent partial-failure hazard.
Area: packages/server/src/controllers/rounds.ts.

PR #33 correctly recognized that changing or deleting a round number has referential consequences. It added lifecycle propagation across:

- Round,
- Draw,
- Submission,
- Result,
- RawTeamResult,
- RawSpeakerResult,
- RawAdjudicatorResult,
- Team.details,
- Adjudicator.details,
- Venue.details,
- nested source_rounds in rounds/draws/tournament config.

The success-path integration test is broad and valuable: it creates all of these references, renumbers Round 1 -> 2, checks that they moved, deletes the round, and checks that they disappeared.

The problem is that the new implementation performs these destructive updates as independent writes without a transaction or compensating rollback.

For deletion, the order is approximately:

    deleteRoundDependencies()
      -> delete draw/submissions/results/raw rows in Promise.all
    delete Round document
    delete entity detail rows
    rewrite nested source_rounds

If the first step succeeds and the Round delete or a later cleanup fails, the Round can remain while its ballots/results/draw are already gone.

For renumbering, the operation does:

    Round.round -> temporary negative number
    move references old -> temporary
    move references temporary -> target
    update Round with requested fields
    rewrite nested source_rounds

moveRoundReferences itself updates multiple collections concurrently. A failure after only some writes complete can produce a tournament where the Round, draw, submissions, raw rows, and entity details disagree on the round number.

The temporary round number reduces unique-key collisions but does not provide atomicity.

The current integration coverage proves the happy path and duplicate-target precheck. It does not inject a write failure after some dependencies have moved/deleted and assert rollback.

Impact:
- silent loss of ballots/raw results/draws on a failed round deletion;
- mixed round numbering after a failed renumber;
- downstream compilation and break source_rounds can reference a state that never existed consistently.

Recommended regression test:
- inject failure in one dependency write after at least one earlier write succeeds;
- assert every collection remains on the original round after the request fails;
- repeat for delete and renumber.

Recommended fix:
- use one Mongo transaction/session for the lifecycle operation where deployment topology supports transactions;
- otherwise implement explicit prepare/rollback with captured preimages rather than treating a long sequence of writes as one operation.

### P8-02 — HIGH/MEDIUM: PR #30 changed institution priority semantics, but class-based adjudicator allocation still interprets the number in the opposite direction

Origin: PR #30 / 415b86d.
Status: confirmed semantic regression/inconsistency.
Area:
- packages/core/src/allocations/common/institution-priority.ts
- packages/core/src/allocations/adjudicators.ts
- packages/core/src/allocations/adjudicators/adjfilters.ts
- packages/core/src/allocations/teams/filters.ts
- admin/docs terminology introduced by PR #30.

PR #30 deliberately redefined institution priority in the UI/docs as an ordering:

    smaller number = conflict should be avoided earlier/more strongly
    priority 1 = highest avoidance priority

Most of the core was adapted correctly. The histogram path sorts priorities ascending and compares the number of priority-1 conflicts before priority-2 conflicts.

However class-based adjudicator allocation still uses:

    weightedCommonScore(left, right, priorityMap)

which currently computes:

    sum(priority number for each common institution)

and buildRolePenalty minimizes that value.

Therefore, for otherwise equal candidates:

    candidate A conflicts with priority-1 institution -> penalty 1
    candidate B conflicts with priority-10 institution -> penalty 10

The class-based selector prefers the smaller penalty, so it prefers candidate A: exactly the conflict that the new UI semantics say should be avoided first.

This does not affect every allocation path. Standard team/adjudicator filters using the lexicographic histogram have the intended smaller-number-first behavior. The inconsistency is specifically dangerous because the same stored institution.priority means opposite things depending on allocation algorithm.

Minimal regression test:
- one room, two equivalent adjudicators;
- adjudicator A has a conflict in institution priority 1;
- adjudicator B has a conflict in institution priority 10;
- expected: choose B;
- current class-based penalty ordering chooses A.

Recommended fix:
- remove raw numeric summation from priority-order semantics;
- use the same lexicographic priority histogram/penalty vector in class-based selection that the other allocation paths use.

### P8-03 — HIGH/MEDIUM: PR #33's stale-fetch fix is only correct within one tournament and creates the cross-tournament mutation race from Phase 7

Origin: PR #33 / b05f06d.
Status: confirmed recent regression pattern; same root cause as P7-02.
Area:
- packages/web/src/stores/teams.ts
- speakers.ts
- adjudicators.ts
- venues.ts
- institutions.ts
- related current-scope entity stores.

PR #33 added an important same-tournament regression test:

    start GET(tournament-1)
    perform bulk delete(tournament-1)
    delete completes
    stale GET completes
    deleted item must not reappear

To enforce that, successful bulk deletes now call:

    advanceFetchSequence()

The test is correct for one tournament. The sequence counter, however, is global to the store rather than scoped by tournamentId.

Missing counterexample:

    current A state
    start bulkDelete(A)
    navigate to B
    start fetch(B), sequence = N
    bulkDelete(A) completes
    advanceFetchSequence() -> N+1
    fetch(B) completes with N and is discarded

The store can then continue exposing A data while the route is B. For create mutations the same architecture can actively insert an A entity before invalidating B's fetch.

So the recent fix solved:

    stale read after write within A

by introducing/strengthening:

    write in A invalidates read in B

The added tests encode only request age, not request scope.

Recommended regression test:
- deferred DELETE/POST for tournament A;
- deferred GET for tournament B;
- let B request start before A mutation completes;
- complete A mutation, then B GET;
- expected final store scope/data = B.

Recommended fix:
- sequence/generation keys must include tournamentId, or state should be cached by tournamentId;
- an A mutation must never invalidate a B read.

### P8-04 — MEDIUM: PR #33 silently changed missing allow_low_tie_win from “allowed” to “disallowed” with no data migration

Origin: PR #33 / b05f06d.
Status: confirmed backward-compatibility regression unless the behavior change was intentionally defined as retroactive.
Area:
- packages/server/src/controllers/submissions.ts
- packages/server/src/controllers/rounds.ts
- packages/server/src/services/response-sanitizer.ts
- packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue
- packages/web/src/views/admin/AdminTournamentSubmissions.vue
- packages/web/src/utils/round-defaults.ts.

Before PR #33, the effective default was:

    allow_low_tie_win !== false

so a pre-existing round with no explicit field allowed the draw/tie path.

PR #33 changed both server validation and Web interpretation to:

    allow_low_tie_win === true

and changed new-round defaults from true to false.

Changing the default for newly created rounds is a product decision. The regression is that the same condition was also applied to historical documents that do not have the field.

No migration/backfill for allow_low_tie_win was found.

Therefore an old/imported tournament containing:

    userDefinedData: { ... }   // allow_low_tie_win absent

changes semantics merely by deploying the new version:

    before #33: draw permitted
    after #33: draw rejected/hidden

The public sanitizer also now emits false for an omitted legacy value, so clients cannot distinguish “old field absent” from an explicitly configured false.

Recommended regression test:
- persist a round document in the pre-#33 shape with allow_low_tie_win absent;
- upgrade/read through current code;
- assert explicitly chosen compatibility behavior.

Recommended fix:
- either backfill legacy missing values to true before adopting false as the new explicit default,
- or version the setting/default by data/schema version;
- do not silently reinterpret absence in historical data.

### P8-05 — MEDIUM: PR #31's bulk report ZIP can mix a historical compiled snapshot with current live ballots

Origin: PR #31 / a866527.
Status: confirmed provenance regression; expands P6 historical-report findings.
Area:
- packages/web/src/views/admin/AdminTournamentCompiled.vue
- packages/web/src/utils/detailed-results-export.ts.

PR #31 added useful detailed vote CSVs and a bulk ZIP.

The ranking/result files are built from the currently selected compiled object, which can be a saved historical snapshot.

The detailed vote file is built from:

    submissions.submissions

which is the live current submission list fetched from the server.

That means one ZIP can contain:

    team_results.csv     -> historical compiled snapshot at time T1
    speaker_results.csv  -> historical compiled snapshot at time T1
    detailed ballots     -> live submissions after edits at T2

If an administrator corrects a ballot after saving a compiled snapshot and later downloads that old snapshot, the archive can contain rankings produced from the old ballot and a detailed-vote file showing the corrected ballot.

The ZIP is technically valid; the defect is archival consistency.

Recommended regression test:
1. create ballot version A;
2. save compiled snapshot S;
3. edit ballot to version B;
4. reopen/export S;
5. assert all files in S's archive refer to one defined provenance point.

Recommended fix:
- store or reconstruct submission provenance with the compiled snapshot;
- or clearly make the detailed-vote file an explicitly named LIVE/CURRENT attachment rather than presenting it as part of one historical result package.

### P8-06 — LOW/MEDIUM: PR #31 introduced detailed vote export without correction timestamps

Origin: PR #31 / a866527.
Status: confirmed recent provenance omission; same issue previously recorded as P6-08.
Area: packages/web/src/utils/detailed-results-export.ts.

The newly introduced DetailedResultsExportRow contains:

    submitted_at

from Submission.createdAt, but no updated_at.

Administrator corrections update the payload and updatedAt while preserving createdAt.

So the export can show corrected ballot contents under the timestamp of the original ballot without indicating that a correction occurred.

The existing comment-sheet exporter already preserves created and updated timestamps, so the omission is inconsistent with another export path.

Recommended fix:
- add updated_at;
- add a regression test where createdAt != updatedAt and verify both appear.

### P8-07 — LOW/MEDIUM: PR #32 hardcoded admin score-editor step=1 despite built-in 0.5-unit scoring styles

Origin: PR #32 / d419cce.
Status: confirmed frontend/style-contract regression.
Area:
- packages/web/src/views/admin/AdminTournamentSubmissions.vue
- packages/server/src/seed/styles.ts.

PR #32 intentionally replaced several numeric inputs from:

    step="0.1"

to:

    step="1"

and added a source-level test that asserts step=1 and rejects step=0.1.

That assumption is false for built-in styles.

Examples in the current style seed:

- North American reply speech: unit = 0.5, default = 37.5
- Asian reply speech: unit = 0.5, default = 37.5

Thus a valid score such as 37.5 is native to UTab's own style definition while the administrator correction UI advertises whole-number increments.

This is primarily an editor/contract bug, not proof that the backend rejects manually typed decimals. But it makes the correction UI disagree with the scoring model, and spinner/HTML step behavior is wrong for legitimate half-point speeches.

The regression test added with the change tests the hardcoded implementation rather than the domain invariant.

Recommended regression test:
- load North American/Asian style;
- edit reply score;
- expected input step derives from range.unit and accepts/increments by 0.5.

Recommended fix:
- bind step to the role/style numeric range unit;
- do the same for feedback using adjudicator_range.unit;
- avoid tests that assert a literal step value independently of style.

### P8-08 — MEDIUM: PR #33's round lifecycle tests are broad but verify only success, so they give unusually strong false confidence around the most destructive new code

Origin: PR #33 / b05f06d.
Status: test-gap finding, supporting P8-01.
Area: packages/server/test/integration.part2.test.ts.

The new integration case "moves and removes all round-scoped references when a round is renumbered and deleted" is one of the strongest success-path tests in the repository. It covers draw, submission, generic result, all three raw-result collections, entity details, round-level source_rounds, and tournament-level source_rounds.

Because it touches almost exactly the same surface as P8-01, its omission matters: it contains no fault injection between the multi-collection writes.

This is a useful example of a recurring recent-change testing pattern:

    broad end-to-end success coverage
    + narrow duplicate/precondition coverage
    - no mid-operation failure coverage

For destructive orchestration, that leaves the critical invariant untested:

    request failure => persistent state is unchanged

This should become an explicit transactional regression-test category rather than adding more success-path assertions.

### Recent changes investigated without a new high-confidence regression

#### PR #29 — Improve tournament ops UI and allocation handling

The submission duplicate helper correctly includes round in its duplicate key and normalizes the ballot team pair order. No cross-round duplicate false positive was found there.

The operations-hub changes were also later strengthened with request gates. Several Phase 7 races are in simpler/current-scope pages rather than evidence of a new #29 hub regression.

#### PR #30 — venue allocation priority ordering itself

The venue allocator added by #30 sorts available venues by smaller priority number first, with venue ID as deterministic tie-breaker, then assigns them to win-sorted rooms. The core test reflects the intended documented semantics. The confirmed #30 issue is the institution-priority interpretation in the class-based adjudicator path, not the venue sort.

#### PR #31 — ZIP byte construction

The browser ZIP writer computes CRC32, local headers, central-directory entries, UTF-8 flags, duplicate-name checks, and end-of-central-directory records in a coherent way. No high-confidence archive-format defect was found. P8-05/P8-06 concern the provenance of the data placed into the archive.

#### PR #32 — ordinary participant double-click protection

The participant confirmation flow disables submission while submissions.loading is true and has an explicit confirmation countdown. The remaining timeout ambiguity is P7-05, not a simple missing busy guard introduced by #32.

#### PR #33 — same-tournament stale-fetch intent

The new entity bulk-delete test correctly prevents an older fetch in the same tournament from resurrecting a deleted entity. The bug is that the mechanism lacks tournament scope, not that the same-tournament test is wrong.

### Change-to-regression map

| Change | Intended improvement | Regression / missing invariant |
| --- | --- | --- |
| PR #30 | smaller-number priority ordering | class-based adjudicator path still minimizes numeric sum, reversing institution-priority meaning |
| PR #31 | detailed CSV + bulk ZIP | historical compiled data can be packaged with live ballots; corrections lack updated_at |
| PR #32 | simpler numeric ballot editing | hardcoded step=1 conflicts with built-in 0.5-unit reply scores |
| PR #33 | stale-read protection after mutations | global sequence lets tournament A invalidate tournament B fetch |
| PR #33 | safer round renumber/delete propagation | many destructive writes have no transaction/rollback |
| PR #33 | default draws/ties off unless explicitly enabled | old records with missing field are silently reinterpreted |

### Regression-test priorities before the fix phase

1. Fault-injected round delete/renumber rollback tests.
2. Class-based institution-priority direction test (priority 1 vs priority 10).
3. Cross-tournament A-mutation/B-fetch deferred-promise tests for every current-scope entity store.
4. Legacy missing allow_low_tie_win compatibility test.
5. Historical compiled snapshot + later ballot edit + bulk ZIP provenance test.
6. Built-in half-point style admin-edit test.
7. Detailed export createdAt/updatedAt correction test.

### Phase 8 conclusion

The recent changes are not simply low-quality patches; many add useful validation and regression coverage. The recurring weakness is that tests mirror the local bug being fixed too closely.

Three examples are particularly important:

- stale-fetch tests model one tournament, while the store is reused across tournaments;
- round lifecycle tests model complete success, while the implementation spans many independent destructive writes;
- numeric-input tests assert a literal UI step instead of deriving the invariant from the selected style.

As a result, recent fixes can be locally correct and globally wrong.

The highest-priority recent-change regressions are the non-atomic round lifecycle introduced in PR #33 and the institution-priority direction mismatch exposed by PR #30's semantic change. The cross-tournament sequence invalidation from PR #33 is the clearest example where a regression test itself points directly at the missing dimension: tournament scope.


## Phase 9 — Static bug-pattern sweep

### Scope and method

Phase 9 searched the current tree for bug-prone static patterns rather than treating every occurrence as a defect. The sweep covered:

- TODO/FIXME markers;
- `any`, unsafe casts, and non-null assumptions;
- swallowed/floating asynchronous work;
- sort comparators and in-place mutation;
- truthiness and `||` / `??` defaults;
- ObjectId/string comparisons;
- date/time handling;
- randomization and seed handling;
- recursive import/export conversion;
- numeric/array boundary assumptions.

High-frequency patterns such as `as any` were only retained when a concrete invariant could be shown to fail.

No production code was changed in this phase.

### P9-01 — HIGH: speaker ranking comparator is non-antisymmetric and can produce wrong compiled speaker rankings

Status: confirmed correctness bug.
Area:
- packages/core/src/general/sortings.ts
- packages/core/src/results/results.ts

`compileSpeakerResults()` assigns final rankings with `speakerComparer`.

The comparator currently behaves approximately as:

    if (left.sum < right.sum) return 1
    if (left.average < right.average) return 1
    return -1

The second condition is evaluated even when `left.sum > right.sum`.

A concrete counterexample is:

    A: sum=140, average=70
    B: sum=80,  average=80

Then:

    compare(A, B) = 1   // because 70 < 80
    compare(B, A) = 1   // because 80 < 140

So both directions claim that the left item should come after the right item.

This violates comparator anti-symmetry and gives `Array.sort()` no coherent ordering. The resulting ranking is therefore engine/order dependent rather than a defined ranking policy.

This is reachable in normal compiled output because the server maps core `compiled_speaker_results` directly. Unlike team and adjudicator custom ranking, the server does not replace speaker ranking with a newer comparator.

The defect is especially plausible when speakers have different participation counts: `sum` and `average` can naturally point in different directions.

Recommended regression tests:

1. Assert comparator laws:
   - `compare(x, x) === 0`
   - `sign(compare(a,b)) === -sign(compare(b,a))`.
2. Compile two speakers where total and average disagree and assert the chosen ranking policy explicitly.
3. Repeat with reversed input order and verify identical rankings.

Recommended fix:
- decide whether speaker ranking is sum-first or average-first;
- implement a genuine lexicographic comparator;
- return 0 on complete equality.

### P9-02 — MEDIUM: multiple core comparators never return 0 on ties, violating the JavaScript sort contract

Status: confirmed systemic correctness/reproducibility defect.
Area: packages/core/src/general/sortings.ts.

Several comparators use two-way expressions such as:

    a > b ? 1 : -1

with no equality branch.

Examples include:

- `sortDecorator` ID fallback;
- `allocationComparer`;
- `allocationSlightnessComparer`;
- `allocationClosenessComparer`;
- `speakerSimpleComparer`;
- `teamSimpleComparer`;
- `adjudicatorSimpleComparer`;
- `adjudicatorComparer`;
- `teamComparer` at complete equality;
- adjudicator sorting with pre-evaluation;
- the older `sortVenues` helper.

For equal inputs this can yield:

    compare(a, b) = -1
    compare(b, a) = -1

instead of 0.

This matters beyond cosmetic ordering. These comparators are used in paths that determine:

- result ranking/tie grouping;
- allocation room ordering;
- venue assignment order;
- adjudicator matching order.

`insertRanking()` also assumes comparator semantics very specifically: it increments rank only when the comparator returns exactly `1`; all other values are treated as not-worse/tied. Feeding it invalid comparators makes ordering and tie detection depend on incidental sort behavior.

Current sorting tests exercise non-tied examples but do not assert comparator algebra.

Recommended fix:
- normalize all comparators to negative / zero / positive semantics;
- add shared property tests for reflexivity/anti-symmetry/transitivity;
- preserve a separate deterministic tie-breaker where a stable total order is required rather than encoding “tie” as `-1`.

### P9-03 — MEDIUM: tournament backup import converts arbitrary ISO-looking user strings into Date objects

Status: confirmed backup round-trip data-fidelity bug.
Area:
- packages/server/src/controllers/tournament-export.ts
- packages/server/src/controllers/tournament-import.ts

The export path first performs a JSON clone:

    JSON.parse(JSON.stringify(value))

so both genuine BSON Dates and ordinary strings are represented as JSON strings in the backup.

The import path then recursively walks every value and applies:

    if (ISO_DATE_PATTERN.test(value)) return new Date(value)

without checking the field name or schema.

Therefore a legitimate user string such as:

    userDefinedData.note = "2026-09-18T12:34:56.000Z"

round-trips as a Date rather than a string.

The same issue can affect arbitrary nested custom metadata or payload fields whose text happens to exactly match the accepted timestamp pattern.

The backup format has discarded the type information needed to distinguish:

    actual Date
    ordinary string that looks like a Date

and the importer guesses globally.

Recommended regression test:
1. store a nested custom string equal to a valid ISO timestamp;
2. export tournament;
3. import bundle;
4. assert the value is still a string;
5. independently assert known timestamp fields still restore as Date values.

Recommended fix:
- use schema/key-aware restoration for known date fields, or
- serialize BSON/Date types with explicit type metadata such as Extended JSON.

### P9-04 — MEDIUM: raw speaker-result API accepts arbitrary score-vector lengths, while aggregation silently truncates to the shortest vector

Status: confirmed validation/aggregation mismatch.
Area:
- packages/server/src/routes/raw-results.ts
- packages/core/src/results/results.ts
- packages/core/src/results/checks.ts

The raw speaker route validates only:

    scores: z.array(z.number())

It does not require a vector length matching the tournament style.

The core aggregation combines multiple raw results for the same speaker/round with:

    limit = Math.min(left.length, right.length)

and drops all elements beyond the shortest input.

No speaker-results precheck validates score-vector dimensions.

So accepted inputs such as:

    voter A: [75, 0, 0]
    voter B: [76]

produce a one-element aggregate; positions 2 and 3 from voter A disappear silently.

This is worse than rejecting malformed input because the stored raw results remain individually visible while compiled output loses data during aggregation.

Recommended regression test:
- submit two raw speaker results for one speaker/round with different vector lengths;
- compilation should reject the inconsistent data rather than truncate it.

Recommended fix:
- validate raw `scores` length against the resolved tournament style on create/update;
- additionally make core summarization throw on unequal vector lengths instead of silently truncating.

### P9-05 — LOW/MEDIUM: service-account idempotency completion is persisted only after the response has finished

Status: confirmed durability/race gap.
Area: packages/server/src/middleware/service-account-idempotency.ts.

The middleware creates an `in_progress` idempotency row before the request.

After the HTTP response emits `finish`, it launches a fire-and-forget update:

    in_progress -> completed

For 5xx responses it similarly launches a fire-and-forget delete.

Consequences:

1. a retry can arrive after the original request has already returned successfully but before the completion update commits and receive:
   `409 A request with this X-Idempotency-Key is still in progress`;
2. a process crash after the successful response but before the update persists can leave a completed operation recorded as `in_progress` until TTL;
3. the analogous 5xx cleanup can also be lost.

The integration test verifies ordinary replay and normally passes because the asynchronous DB write usually finishes quickly. It does not establish the stronger durability invariant across the response boundary or process failure.

Recommended fix:
- persist the replayable completed record before committing the successful response, or otherwise make completion recovery explicit;
- add a delayed-persistence/immediate-retry test and a stale-`in_progress` recovery policy.

### P9-06 — LOW/MEDIUM: audit logging is best-effort after response completion, so successful sensitive mutations do not guarantee an audit record

Status: confirmed durability gap; severity depends on the intended compliance guarantees.
Area: packages/server/src/middleware/audit-log.ts.

Audit entries are created from a `finish` handler with a fire-and-forget promise:

    void AuditLogModel.create(...).catch(logger.warn)

Therefore the user-visible mutation can complete successfully even if:

- the audit database write fails;
- the process terminates immediately after the response;
- shutdown begins before the write completes.

The existing audit integration test explicitly polls until the asynchronous row appears. That confirms the current best-effort design rather than a durability guarantee.

This is not necessarily wrong if audit logs are explicitly documented as telemetry. It is a defect if they are intended as a security/compliance audit trail for actions such as privacy erasure or service-token revocation.

Recommended action:
- document the guarantee explicitly;
- if audit durability is required, make sensitive mutations and audit persistence transactional/outbox-backed or otherwise durable before acknowledging success.

### Static patterns investigated but not retained as bugs

#### getWeightedScore denominator-only weighting

At first glance `getWeightedScore()` appears to omit multiplying each score by its weight.

The built-in style model shows why this is not sufficient evidence of a bug: reply speeches with weight 0.5 are stored on a half-scale range (for example 30–45 with default 37.5). Dividing the sparse raw score by the 0.5 slot weight normalizes 37.5 to a full-scale equivalent of 75.

Without contrary domain evidence, this is treated as intentional normalization rather than a defect.

#### ObjectId/string comparisons

Most tournament/entity comparison paths normalize IDs through `String(...)`, and no new cross-tournament ObjectId-equality defect was confirmed in this sweep.

#### random allocation seeds

Core random allocation incorporates time/randomness in several modes. This reduces reproducibility but appears consistent with explicit random allocation semantics. No preview/save mismatch was demonstrated here.

#### high volume of `as any`

Many casts are present at Mongo/API adaptation boundaries. They weaken static checking, but Phase 9 did not classify casts by count alone. Only casts participating in a concrete broken invariant were retained.

### Test gaps exposed by Phase 9

The most useful additions are not more snapshot/source-string tests. They are invariant tests:

1. comparator algebra tests for every exported comparator;
2. speaker ranking permutation-invariance tests;
3. backup export/import type-preservation tests;
4. raw score-vector dimension tests;
5. idempotency tests with delayed completion persistence;
6. fault-injected audit persistence tests if audit durability is part of the contract.

### Phase 9 conclusion

The static sweep found a concentrated problem in old core ranking code rather than a broad collection of miscellaneous syntax smells.

The most important new correctness issue is `speakerComparer`: it is not merely missing an equality case; it can return “greater than” in both directions for two unequal speakers, so final speaker rankings can be wrong and input-order/engine dependent.

The broader comparator family has the same contract weakness on ties and should be fixed as one unit.

Outside ranking, the strongest data-integrity issue is the backup importer’s global ISO-string-to-Date conversion. The raw speaker-result path has a similar boundary problem: permissive input is accepted and only later silently truncated by aggregation.

The recurring theme is that several boundaries infer structure instead of validating or preserving it explicitly:

    comparator ordering
    JSON type restoration
    score-vector dimensions
    asynchronous durability

Those are better Phase 10 targets than mechanically reducing `any` counts.


## Phase 10 — Targeted regression tests and minimal counterexamples

### Goal

Phase 10 converts the strongest static findings into executable counterexamples before any production fix is attempted.

The tests deliberately encode invariants rather than the current implementation:

- comparator equality must return 0;
- comparator direction must be antisymmetric;
- compiled ranking must not depend on entity input order;
- aggregation must not silently discard score dimensions;
- accepted raw-result dimensions must match the tournament style;
- tournament backup/restore must preserve user-data types.

Production code remains unchanged in this phase, so the new regression tests are expected to fail until Phase 11 fixes the corresponding defects.

### P10-01 — Comparator contract tests reproduce P9-01/P9-02

Added:

- `packages/core/tests/general-sortings-contracts.test.ts`

The new tests check complete ties for:

- `speakerSimpleComparer`
- `teamSimpleComparer`
- `adjudicatorSimpleComparer`
- `speakerComparer`
- `adjudicatorComparer`
- `teamComparer`

All six currently return `-1` rather than `0` for complete equality.

A separate anti-symmetry test uses:

    A: sum=140, average=70
    B: sum=80,  average=80

Observed:

    speakerComparer(A, B) = 1
    speakerComparer(B, A) = 1

This confirms the comparator is not merely unstable on exact ties; it gives contradictory direction for unequal records.

CI confirmation:

- normal CI run 35361296573;
- core: 7/7 newly added comparator-contract tests failed for the expected reasons.

### P10-02 — Compiled speaker ranking is directly input-order dependent

Extended:

- `packages/core/tests/results-summarize.test.ts`

Counterexample:

- speaker 1: round averages 70, 70 -> compiled sum 140, average 70;
- speaker 2: one round average 80 -> compiled sum 80, average 80.

The same raw results are compiled twice with speaker instances in opposite order.

Observed CI result:

    order [1, 2] -> rankings {1: 1, 2: 2}
    order [2, 1] -> rankings {1: 2, 2: 1}

So P9-01 is confirmed as an externally visible ranking defect, not only a comparator-law violation.

### P10-03 — Core aggregation silently truncates mismatched speaker score vectors

Extended:

- `packages/core/tests/results-summarize.test.ts`

Counterexample:

    ballot/result A scores = [70, 75]
    ballot/result B scores = [72]

The invariant test expects compilation to reject inconsistent dimensions.

Observed CI result:

    expected function to throw
    received: no exception

This confirms the current `sumByEach()` minimum-length behavior silently discards the second score dimension.

### P10-04 — Raw speaker API accepts a vector whose length contradicts the configured style

Extended:

- `packages/server/test/integration.part2.test.ts`

Test tournament override:

    score_weights = [1, 1, 1]

Submitted raw speaker result:

    scores = [75]

Expected:

    HTTP 400

Observed in focused server CI:

    HTTP 201

Focused run:

- workflow run 35361576749;
- exact failing assertion: expected 201 to be 400.

This independently confirms the server-side half of P9-04. The malformed record is accepted before core aggregation sees it.

### P10-05 — Backup round-trip changes an ordinary ISO-looking string into a Date

Extended the existing backup restore integration test in:

- `packages/server/test/integration.part3.test.ts`

Stored user metadata:

    userDefinedData.isoLookingUserText =
      "2026-09-18T12:34:56.000Z"

Expected after export/import:

    same value, type string

Observed in focused server CI:

    expected "2026-09-18T12:34:56.000Z"
    received 2026-09-18T12:34:56.000Z as Date

Focused run:

- workflow run 35361576749.

This confirms P9-03 with the actual export/import path and Mongo model rather than only static inspection.

### CI mechanics

The repository's ordinary `pnpm test` stops/falls back at the failing core regressions before a deterministic focused server check is convenient.

A temporary branch-only workflow was therefore added to run only:

1. the raw score-vector regression;
2. the backup type-preservation regression.

Both failed exactly at the intended assertion. The temporary workflow file was then removed; it is not part of the final branch tree.

Relevant commits:

- `f868509` — comparator contract regressions;
- `8168c8b` — speaker ranking/order and truncation regressions;
- `919197a` — raw speaker score-length regression;
- `07a708d` — backup type-preservation regression;
- `922caa2` / `ebba770` — temporary focused runner added and removed.

### Findings not converted into failing tests

P9-05 (idempotency completion durability) and P9-06 (audit-log durability) are real implementation gaps, but their desired behavior is partly a product/operational contract.

Creating a failing test now would prematurely choose one of these guarantees:

- response must wait for durable persistence;
- stale `in_progress` records must self-heal;
- audit logging is mandatory and mutation failure-coupled;
- audit logging is explicitly best-effort telemetry.

For Phase 11, the implementation contract should be selected first, then fault-injection tests should be added around that contract. Useful seams would allow delaying/rejecting the idempotency completion write and audit-log write deterministically.

### Phase 10 conclusion

Four high-value defects are now backed by executable minimal counterexamples:

1. comparator contract failure;
2. speaker ranking depends on input order;
3. mismatched speaker vectors are silently truncated and are accepted by the raw API;
4. backup restore changes valid user string types.

These tests fail on the current implementation for the exact reasons predicted in Phase 9. They are suitable as red tests for Phase 11: fixes can now be made without relying on subjective manual verification.

## Phase 11 — Fix sweep and regression closure

Phase 11 resumed from the red tests created in Phase 10 and then expanded to the highest-confidence defects already identified in Phases 3-9. The implementation work was performed directly on `codex/utab-bug-audit-20260918`.

### P11-01 — Comparator and compiled speaker ranking contracts fixed

Commits:

- `0a6308101ec54dce642ccf97fedf5b8058ab1fb8` — Fix core comparator contracts.

The general result comparators now return zero for true ties and the speaker comparator is antisymmetric. The Phase 10 input-order counterexample no longer changes compiled speaker ranking.

This closes the executable regressions for P9-01/P9-02 and the related P3-08 comparator issue.

### P11-02 — Speaker score-vector dimensions are now enforced end to end

Commits:

- `f511aee125fb0ccd9766fbe713bba7d1deb81c60` — Reject inconsistent speaker score vectors.
- `b417069e3173a484ab04a6a28514c6b8525c1d40` — Validate raw speaker score vector dimensions.

Core aggregation no longer truncates to the shortest vector. The raw speaker-result API now validates the score length against the tournament style before create/update.

This closes P9-04 and the Phase 10 server/core counterexamples.

### P11-03 — Tournament restore preserves ordinary user strings

Commit:

- `c3ca8bfd3134d1b1e2c4632f0f507767516173e4` — Preserve user string types in tournament restore.

Date revival is restricted to schema-known date fields instead of coercing arbitrary ISO-looking strings recursively.

This closes P9-03 and the Phase 10 backup round-trip regression.

### P11-04 — Allocation correctness fixes

Relevant commits:

- `481f27e2f45d3e0cbb3539515a1fad8f68d9c71b` — Honor institution priority order in class-based allocation.
- `46ed25e42f1d7a595856430eca089deed4b3a159` — Test class-based institution priority direction.
- `108a21e6b0d2b9d4fed1ace5ea35b1c792398bd3` — Make standard team matching finite and unique.
- `091ca28c707c6b22690f6a46c707fbde14a4425c` — Fix team ranking weights and strict availability.
- `c13f6ef6a97c2eaebe49000c024af3d5e701d9ff` — Validate generated draws before persistence.

These changes address the concrete failures behind P3-01/P3-02/P3-03/P3-04/P3-05/P3-06 and P8-02.

Generated draws are structurally checked before save, including complete assignment of all available teams.

### P11-05 — Security and authorization fixes

Relevant commits:

- `847af2fd9b49e3146d542ba3229624b1e5ad398d` — Separate superuser and tournament access authorization.
- `361612deba7c514e730a9a26abb5ed10e10b597f` — Restrict global style mutation to superusers.
- `aaeaba50a3ae607523ba52bcc72e9822fe24e3d1` — Restrict service token revocation to superusers.
- `1584fbda9c2d08462574bde408c14d7dbe009785` — Hash tournament access passwords on write.
- `206aaf63555463d5ef2d01d4f97ce302fc58db41` — Require tournament access session for participant submissions.

These close the directly actionable authorization/storage defects P5-01, P5-03, P5-04, and P5-05.

P5-02 remains conceptually distinct: possession of tournament access is still not a cryptographic binding between the requester and a concrete speaker/team/adjudicator entity.

### P11-06 — Compilation and result correctness fixes

Relevant commits:

- `ff8ac13ccde5c61512070a245314f919c67da221` — Preserve null score metrics and fix compiled vote rate.
- `93f30f31908952f18275ec6585cf1670aa8321cc` — Allow null compiled vote rate when votes are not applicable.
- `d25d0df7181724096e206cba228f1a364da542dd` — Harden submission compilation completeness and attribution.

This resolves the confirmed vote-rate scale defect P6-03/P3-09 and prevents absent score metrics from being silently converted to numeric zero in the repaired paths.

### P11-07 — Round lifecycle and legacy tie behavior hardened

Relevant commits:

- `52585b2bfcfc53d9222f870fc88cb6ec94110003` — Guard round renumbering with compare-and-set.
- `6e2ade7d6a216a0cdd2c9042d0a2af93886f6131` — Preserve legacy tie setting semantics.
- `fbb92ae769a63a2fda303ea8f04a6cc8d3ec9409` — Preserve legacy round tie setting in public responses.
- `6240f8aa15bdc7ccc8f582f5f667c3dfbd272d3f` — Honor legacy tie settings in participant ballot UI.
- `10aebb1850cfe8b204741f76ca828347d98e1929` — Honor legacy tie settings in admin submissions UI.

The renumber path now checks the expected prior round number before moving a Round document. Missing `allow_low_tie_win` retains the legacy meaning (draws allowed unless explicitly disabled) consistently across server/public/admin/participant surfaces.

This fixes P8-04 and materially narrows P4-01, but does not by itself solve the broader stale-writer and failure-atomicity families P4-02/P4-05.

### P11-08 — Cross-tournament raw-result UI contamination fixed

Commit:

- `0920184499d5994214931b4767f0a0e5df843a65` — Scope raw-result UI state to the active tournament.

This addresses the concrete P7-01-style stale draw/result binding path that was reproduced during the UI audit.

Other current-tournament store mutation races from P7-02/P7-03/P7-06 still require a common mutation/request gate rather than one-off local fixes.

### P11-09 — Regression-suite reconciliation

The implementation fixes exposed several older tests whose expectations encoded the behavior that Phase 11 intentionally changed. They were reconciled rather than reverting the fixes.

Final reconciliation commits:

- `e1c381972105c5402647146fd42dca395ac10037` — use a superuser, not an organizer, when listing inactive global service-token revocations;
- `647f8a9accfb94ccc19e0764178ff9706720b618` — expect the legacy default `allow_low_tie_win=true` in the public round sanitizer;
- `ae88916103919eb6bdad6a640ac640ee70548feb` — update the admin submissions source regression to the same legacy tie default.

Final CI:

- workflow run: `35374299467`;
- conclusion: **success**;
- lint: success;
- test: success;
- build: success;
- final package summaries include core 24/24 test files, server 12/12 test files, and web 66/66 test files passing.

### Remaining findings after Phase 11

The branch is green, but the audit should not be read as saying every previously identified issue is closed.

In particular:

- **P3-07 remains confirmed**: `strict pairing_method=adjusted` still computes an invariant objective. `combinations(div, div.length)` yields only the complete group, and the subsequent sum of historical side-list lengths is invariant to how teams were partitioned. Repository history shows this logic has existed since the initial implementation; the current UI nevertheless describes it as choosing the lower-bias candidate. This needs a product-level objective before replacing the algorithm.
- **P4-02 remains HIGH**: a request that validated a round before a concurrent renumber/delete can still commit round-scoped data later. The Phase 11 renumber CAS protects the renumber writer but does not provide a shared mutation epoch/lock with submissions and draws.
- **P4-03/P4-05/P4-06/P4-07/P4-08** remain architectural concurrency/failure-atomicity gaps.
- **P5-02/P5-06/P5-07/P5-08** remain separate identity/session-hardening issues.
- **P6-05/P6-06/P6-07/P6-08** remain report provenance / compile contract gaps.
- **P7-02/P7-03/P7-04/P7-05/P7-06/P7-07/P7-09** remain frontend state/contract issues unless independently addressed later.
- **P9-05/P9-06** remain contract-dependent durability questions as documented in Phase 10.

### Phase 11 conclusion

The Phase 10 red tests are green, the branch-wide CI is green, and a substantial set of high-confidence allocation, authorization, compilation, lifecycle, and cross-tournament defects has been fixed.

The next work should not be another broad sweep. The highest-value remaining work is to isolate one architectural family at a time, beginning with either:

1. a round mutation/write coordination design for P4-02/P4-03/P4-05/P4-06; or
2. the participant identity-binding model for P5-02.

Both need an explicit invariant before implementation because a local patch that only narrows the race window would not close the underlying defect.

## Phase 12 — Round-scoped write coordination (P4-02)

Phase 12 focused narrowly on P4-02: a request could validate Round R, a concurrent renumber/delete could then move or remove R, and the already-validated request could still create data under the obsolete round number. The same concurrency gap also allowed delete-vs-renumber to delete a Round by id after its numeric round had changed.

### Coordination invariant

Round-bound writes and structural Round mutations now share an explicit database-backed invariant:

1. a normal Round-bound writer must hold a write lease on the exact Round document before committing;
2. a structural mutation (renumber/delete) may acquire its mutation lease only when the active writer count is zero;
3. once a mutation lease is held, no new writer may acquire a lease;
4. leases are fenced by a monotonically increasing mutation epoch, so a release from an earlier epoch cannot modify the state of a later mutation;
5. structural mutation state is fail-closed. There is deliberately no timeout that can declare a still-running writer stale and thereby reopen the original race.

This is implemented in:

- `packages/server/src/services/round-write-guard.service.ts`
- hidden coordination fields on `Round`:
  - `roundActiveWriteCount`
  - `roundActiveWriteTouchedAt`
  - `roundMutationLocked`
  - `roundMutationEpoch`

The fields are `select:false` and are removed by the Round JSON transform, so they do not become part of the public/admin Round DTO.

Relevant commits:

- `815cbe8815b6c0b77fdd403a91a9bc833f4491cb` — add Round coordination state;
- `b1792c21380425ca5ee3501859cb58a54315f3ea` — add write/mutation lease service;
- `8d6e573b9c670d7f381a61c6b9888d59c999aea8` — remove timeout-based stale-writer override and keep the invariant fail-closed;
- `0678efcc13ad58e69991a2916e4b63ef20679f6f` — initialize the mutation epoch atomically for pre-existing Round documents that predate the new fields.

The legacy compatibility detail is important. Without the `$inc: { roundMutationEpoch: 0 }` initialization, a write lease acquired on an old Round lacking the epoch field would normalize the missing epoch to zero in memory, but its release filter `roundMutationEpoch: 0` would not match the still-missing database field. That would leak `roundActiveWriteCount`. The final regression test explicitly removes all coordination fields before exercising the guard.

### Submission writes

Ballot and feedback normalization now returns the exact Round document id it validated.

Before create commits, the controller acquires a write lease using both:

- the requested numeric round; and
- the validated Round document id.

Therefore this sequence is now rejected:

    validate old Round 1
    concurrent admin renumbers/deletes Round 1
    stale request attempts to acquire write lease for old Round id + round 1
    -> lease acquisition fails; HTTP 409; no submission is inserted

The same guard is applied to submission updates. Updates additionally filter on the previously read submission round and version so a Round-reference move that happened before commit cannot be overwritten by a stale submission update.

Relevant final commits include:

- `3719171e677d304f64381efb5192e850bcd2160b` — final submission lease cleanup scope;
- earlier implementation commit `e559dde43b57c000c95e4316717ae004fef88404`.

### Draw writes

Both persistent draw paths are guarded:

- `POST /draws` / draw upsert;
- `POST /draws/generate` when `save=true`.

The writer lease is tied to the Round id that was read before validation/generation. A concurrent structural mutation therefore cannot pass between Round validation and draw persistence.

Read-only generation (`save=false`) does not acquire a write lease.

Commit:

- `4557cbb367d36f9de5bbd5b24d15628ce1409886` — coordinate draw writes with structural Round mutations.

### Stored Result writes

The same protection was added to the generic stored Result create/update paths.

Create requires the target Round document and holds its write lease through persistence.

Update acquires the target Round lease and uses a stale-write filter on the old result round/version. If the source Round was renumbered after the result was read, the update can no longer move the migrated record back to the obsolete round.

Commit:

- `be27121dd2483f434bea87ff752b5ffc40945762` — coordinate stored Result writes.

### Renumber and delete

Single Round renumber and delete now acquire a mutation lease against the exact Round id and expected numeric round before moving/deleting dependent records.

Consequences:

- an active submission/draw/result writer makes renumber/delete return HTTP 409 rather than racing it;
- once renumber/delete owns the mutation lease, new guarded writers return HTTP 409;
- delete can no longer read Round 1, race a renumber to Round 2, then delete the Round-2 document by id while deleting only Round-1 dependencies.

Renumbering uses a per-Round unique negative temporary number derived from the Round ObjectId instead of one shared sentinel. This removes an avoidable collision between concurrent/bulk temporary moves.

Bulk renumber/delete obtains mutation leases in deterministic id order and releases already-acquired leases if the complete set cannot be claimed.

Relevant commits:

- `b28e6de6c799705ff1d1fb02b73ed9e34d4cf002` — shared multi-Round mutation lease helpers;
- `ddfac4a3e410d1ace7e4701b9a4aab58c6aa5f2e` — unique temporary round numbers;
- `62edc9724eb9b62d3b048b9451d06f05f3b98e3f` — single renumber/delete guard;
- `cf4360c0d8c055ecd49c0de14ee5f27f159166ed` — bulk mutation guard.

An intermediate refactor accidentally displaced `previewBreakCandidates`; it was restored from the pre-refactor source in `151176fb62c00c887a1d0105d9eddc57da3dfb72`. Subsequent branch-wide CI is green.

### Executable regression

`packages/server/test/integration.part4.test.ts` now contains a Round coordination regression that verifies:

1. internal coordination fields are not exposed in a newly created Round response;
2. the guard works for a legacy Round whose coordination fields are manually removed;
3. an acquired normal write lease blocks both renumber and delete;
4. an acquired mutation lease blocks a new direct write lease;
5. the same mutation lease blocks real API writes through:
   - draw upsert,
   - ballot submission,
   - stored Result creation;
6. after leases are released normally, renumber succeeds and the renamed Round can subsequently be deleted.

The final compatibility extension is in:

- `e293c651f5851b0d700d98406ed655669529ac1e`.

### Raw-result contract reconciliation

During the sweep I checked whether raw-result CRUD should also be forced through the Round guard.

It should not be folded into P4-02 without a separate product-contract change. Existing integration coverage intentionally creates raw result rows for `r=1` without first creating a Round document. Raw results are therefore currently an independent raw-data layer keyed by `r`, not a Round-bound write API with the same existence invariant as submissions/draws/results.

A provisional attempt to require Round leases for raw results was reverted after this contract was confirmed. Final tree commits restoring the established behavior are:

- `5365fcdebb992afc7fc6c21911743a413157c794`;
- `4d0f8c25bcbafe271c4acaefb61fd1539a43dbb4`.

If raw results should instead become strict Round children, that should be a separate migration/API decision with corresponding import/legacy semantics, not an incidental concurrency patch.

### Final CI

Final head before this log update:

- `e293c651f5851b0d700d98406ed655669529ac1e`

GitHub Actions:

- run `35376712911`
- conclusion: **success**
- lint: success
- tests: success
- build: success
- test-file summaries:
  - core: 24/24
  - web: 66/66
  - server: 12/12

### P4-02 status and remaining boundaries

**P4-02 is closed for the Round-bound API paths identified in the finding: submissions and persistent draws; stored Results were guarded at the same boundary as an additional hardening step. Delete-vs-renumber is also serialized by the same Round mutation lease.**

This does not close the broader Phase 4 family:

- **P4-03 remains**: break metadata and Team availability are still a two-part state transition and can diverge under concurrent break updates.
- **P4-05 remains**: the mutation lease prevents concurrency races but does not make multi-collection renumber/delete failure-atomic. A database/write failure midway through dependency migration can still leave partial state.
- **P4-06 remains**: stale full-array maintenance writes can still overwrite unrelated concurrent edits.
- **P4-07 remains**: compilation still lacks a coherent multi-collection snapshot.
- The target-round namespace race is also not fully solved by P4-02 coordination: a new Round can still race into a renumber target after the initial target-conflict check. That belongs with the remaining Round lifecycle atomicity/namespace work rather than the stale-writer bug fixed here.

Operational tradeoff: because correctness is fail-closed, a process crash after acquiring a lease can leave coordination state that blocks structural mutation. The implementation intentionally does not use a time-based override, because force-expiring a genuinely long-running writer without a transaction/fencing commit would recreate P4-02. Recovery/lease ownership for multi-process crash tolerance should be designed together with the P4-05 atomicity work rather than weakening this invariant.

