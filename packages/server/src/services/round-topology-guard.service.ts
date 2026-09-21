import type { Connection } from 'mongoose'
import {
  acquireEntityNamespaceLease,
  readEntityNamespaceLeaseState,
  releaseEntityNamespaceLease,
  type EntityNamespaceLease,
  type EntityNamespaceLeaseState,
} from './entity-namespace-guard.service.js'

export const ROUND_TOPOLOGY_NAMESPACE = 'round-topology'

export async function acquireRoundTopologyLease(
  connection: Connection,
  tournamentId: string
): Promise<EntityNamespaceLease | null> {
  return acquireEntityNamespaceLease(connection, tournamentId, ROUND_TOPOLOGY_NAMESPACE)
}

export async function releaseRoundTopologyLease(
  connection: Connection,
  lease: EntityNamespaceLease
): Promise<boolean> {
  return releaseEntityNamespaceLease(connection, lease)
}

export async function readRoundTopologyState(
  connection: Connection,
  tournamentId: string
): Promise<EntityNamespaceLeaseState> {
  return readEntityNamespaceLeaseState(connection, tournamentId, ROUND_TOPOLOGY_NAMESPACE)
}

export function roundTopologyChanged(
  before: EntityNamespaceLeaseState,
  after: EntityNamespaceLeaseState
): boolean {
  return after.active || after.epoch !== before.epoch
}
