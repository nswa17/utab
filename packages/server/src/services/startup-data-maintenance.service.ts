import {
  runTournamentAccessMaintenance,
  type TournamentAccessMaintenanceSummary,
} from './tournament-access-maintenance.service.js'
import {
  runTournamentMembershipMaintenance,
  type TournamentMembershipMaintenanceSummary,
} from './tournament-membership-maintenance.service.js'

export type StartupDataMaintenanceSummary = TournamentAccessMaintenanceSummary &
  TournamentMembershipMaintenanceSummary

export async function runStartupDataMaintenance(): Promise<StartupDataMaintenanceSummary> {
  const [accessSummary, membershipSummary] = await Promise.all([
    runTournamentAccessMaintenance(),
    runTournamentMembershipMaintenance(),
  ])
  return {
    ...accessSummary,
    ...membershipSummary,
  }
}
