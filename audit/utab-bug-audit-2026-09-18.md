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
