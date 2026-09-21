# Phase 9 audit — round lifecycle failure safety

Date: 2026-09-21
Branch: `audit/round-failure-phase9-20260921`
Base: `audit/integration-phase8-20260920`

## Scope

Audit round renumber/delete behavior under concurrency and partial multi-collection write failure. Membership deletion races were not repeated because Phase 8 already verified lifecycle/member serialization.

## Findings

1. **Topology was read before the topology lease in several paths.**
   - Single delete read the round number before acquiring the topology/entity leases.
   - Bulk delete read target round numbers before acquiring the leases.
   - Bulk update computed the current topology and renumber plan before acquiring the leases.
   - A concurrent renumber could therefore complete between the read and lease acquisition, leaving the later operation to act on stale round numbers.

2. **Single-round renumber released the topology/entity leases too early.**
   - The lease was released after temporary/final dependency moves but before the Round document final update and nested stored-reference rewrite.
   - A competing topology mutation could therefore observe an intermediate state.

3. **Multi-collection lifecycle writes had no transient-failure convergence.**
   - `moveRoundReferences`, dependency deletion, entity detail deletion, nested reference rewrites, and Round staging/final writes can span multiple independent Mongo writes.
   - A one-off failure in one collection could leave siblings already updated.

## Changes

- Acquire topology mutation leases before reading topology in single delete, bulk delete, and bulk round-update paths.
- Hold the single-renumber lease through the final Round update and stored-reference rewrite.
- Add bounded retry for idempotent round lifecycle mutations:
  - dependency/reference moves,
  - dependency deletes,
  - entity round-detail deletes,
  - stored nested-reference rewrites,
  - single/bulk Round staging/final updates and deletes.
- Retry only failed members of independent mutation batches.
- Preserve existing version increments: already-successful reference moves are not replayed.
- Add deterministic regression coverage for:
  - transient Result move failure during renumber,
  - transient Submission delete failure during round deletion,
  - deletion-vs-renumber stale-read race.

## Residual risk

This does **not** claim transaction-level atomicity. If a write fails persistently, the process terminates mid-mutation, or the database connection is lost during recovery, a standalone Mongo deployment cannot guarantee rollback across all collections. Full atomicity requires MongoDB multi-document transactions (replica set / transactional deployment) or a durable application-level journal/recovery protocol.

The Phase 9 change is therefore intentionally scoped to:
- closing known concurrency windows with leases, and
- making ordinary transient single-write failures converge safely within the request.
