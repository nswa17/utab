import type { Connection } from 'mongoose'
import { getRoundModel } from '../models/round.js'

export type RoundWriteLease = {
  roundId: string
  tournamentId: string
  round: number
  epoch: number
}

export type RoundMutationLease = RoundWriteLease

export const ROUND_WRITE_LEASE_STALE_MS = 5 * 60 * 1000

function normalizeEpoch(value: unknown): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function toLease(
  document: Record<string, unknown>,
  tournamentId: string
): RoundWriteLease {
  return {
    roundId: String(document._id ?? ''),
    tournamentId,
    round: Number(document.round),
    epoch: normalizeEpoch(document.roundMutationEpoch),
  }
}

async function recoverStaleRoundWriteState(
  connection: Connection,
  tournamentId: string,
  round: number,
  roundId?: string
): Promise<void> {
  const RoundModel = getRoundModel(connection)
  const staleBefore = new Date(Date.now() - ROUND_WRITE_LEASE_STALE_MS)
  const filter: Record<string, unknown> = {
    tournamentId,
    round,
    $and: [
      {
        $or: [
          { roundMutationLocked: true },
          { roundActiveWriteCount: { $gt: 0 } },
        ],
      },
      {
        $or: [
          { roundActiveWriteTouchedAt: { $lt: staleBefore } },
          { roundActiveWriteTouchedAt: null },
          { roundActiveWriteTouchedAt: { $exists: false } },
        ],
      },
    ],
  }
  if (roundId) filter._id = roundId

  await RoundModel.updateOne(
    filter,
    {
      $set: {
        roundMutationLocked: false,
        roundActiveWriteCount: 0,
        roundActiveWriteTouchedAt: new Date(),
      },
      $inc: { roundMutationEpoch: 1 },
    }
  ).exec()
}

export async function acquireRoundWriteLease(
  connection: Connection,
  tournamentId: string,
  round: number,
  expectedRoundId?: string
): Promise<RoundWriteLease | null> {
  await recoverStaleRoundWriteState(
    connection,
    tournamentId,
    round,
    expectedRoundId
  )
  const RoundModel = getRoundModel(connection)
  const filter: Record<string, unknown> = {
    tournamentId,
    round,
    roundMutationLocked: { $ne: true },
  }
  if (expectedRoundId) filter._id = expectedRoundId

  const claimed = await RoundModel.findOneAndUpdate(
    filter,
    {
      $inc: { roundActiveWriteCount: 1, roundMutationEpoch: 0 },
      $set: { roundActiveWriteTouchedAt: new Date() },
    },
    { new: true }
  )
    .select({ _id: 1, round: 1, roundMutationEpoch: 1 })
    .lean()
    .exec()

  return claimed ? toLease(claimed as Record<string, unknown>, tournamentId) : null
}

export async function releaseRoundWriteLease(
  connection: Connection,
  lease: RoundWriteLease
): Promise<void> {
  const RoundModel = getRoundModel(connection)
  await RoundModel.updateOne(
    {
      _id: lease.roundId,
      tournamentId: lease.tournamentId,
      roundMutationEpoch: lease.epoch,
      roundActiveWriteCount: { $gt: 0 },
    },
    {
      $inc: { roundActiveWriteCount: -1 },
      $set: { roundActiveWriteTouchedAt: new Date() },
    }
  ).exec()
}



async function tryAcquireMutationLease(
  connection: Connection,
  tournamentId: string,
  roundId: string,
  expectedRound: number,
  activeWriteFilter: Record<string, unknown>,
  resetActiveWrites: boolean
): Promise<RoundMutationLease | null> {
  await recoverStaleRoundWriteState(
    connection,
    tournamentId,
    expectedRound,
    roundId
  )
  const RoundModel = getRoundModel(connection)
  const claimed = await RoundModel.findOneAndUpdate(
    {
      _id: roundId,
      tournamentId,
      round: expectedRound,
      roundMutationLocked: { $ne: true },
      ...activeWriteFilter,
    },
    {
      $set: {
        roundMutationLocked: true,
        roundActiveWriteTouchedAt: new Date(),
        ...(resetActiveWrites ? { roundActiveWriteCount: 0 } : {}),
      },
      $inc: { roundMutationEpoch: 1 },
    },
    { new: true }
  )
    .select({ _id: 1, round: 1, roundMutationEpoch: 1 })
    .lean()
    .exec()

  return claimed ? toLease(claimed as Record<string, unknown>, tournamentId) : null
}

export async function acquireRoundMutationLease(
  connection: Connection,
  tournamentId: string,
  roundId: string,
  expectedRound: number
): Promise<RoundMutationLease | null> {
  return await tryAcquireMutationLease(
    connection,
    tournamentId,
    roundId,
    expectedRound,
    {
      $or: [
        { roundActiveWriteCount: { $exists: false } },
        { roundActiveWriteCount: { $lte: 0 } },
      ],
    },
    true
  )
}

export async function releaseRoundMutationLease(
  connection: Connection,
  lease: RoundMutationLease
): Promise<boolean> {
  const RoundModel = getRoundModel(connection)
  const result = await RoundModel.updateOne(
    {
      _id: lease.roundId,
      tournamentId: lease.tournamentId,
      roundMutationLocked: true,
      roundMutationEpoch: lease.epoch,
    },
    {
      $set: {
        roundMutationLocked: false,
        roundActiveWriteTouchedAt: new Date(),
      },
    }
  ).exec()
  return result.matchedCount === 1
}
