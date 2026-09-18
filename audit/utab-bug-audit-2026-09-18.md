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
