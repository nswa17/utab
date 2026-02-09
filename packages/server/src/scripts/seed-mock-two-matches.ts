import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../../..')

dotenv.config({ path: path.join(rootDir, '.env') })
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(rootDir, '.env.development') })
}

const BASE_TOURNAMENT_NAME = 'Mock Two Matches'
const BASE_USERNAME = 'mock-organizer'
const DEFAULT_PASSWORD = 'password123'
const ROUND_NUMBER = 1

async function main() {
  const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
  const { TournamentModel } = await import('../models/tournament.js')
  const { TournamentMemberModel } = await import('../models/tournament-member.js')
  const { UserModel } = await import('../models/user.js')
  const { hashPassword } = await import('../services/hash.service.js')
  const { closeTournamentConnections, getTournamentConnection } = await import(
    '../services/tournament-db.service.js'
  )
  const { getTeamModel } = await import('../models/team.js')
  const { getSpeakerModel } = await import('../models/speaker.js')
  const { getAdjudicatorModel } = await import('../models/adjudicator.js')
  const { getRoundModel } = await import('../models/round.js')
  const { getDrawModel } = await import('../models/draw.js')
  const { getVenueModel } = await import('../models/venue.js')
  const { getSubmissionModel } = await import('../models/submission.js')

  const findAvailableTournamentName = async (baseName: string): Promise<string> => {
    let name = baseName
    let suffix = 1
    // eslint-disable-next-line no-await-in-loop
    while (await TournamentModel.exists({ name })) {
      suffix += 1
      name = `${baseName} (${suffix})`
    }
    return name
  }

  const findAvailableUsername = async (baseName: string): Promise<string> => {
    let name = baseName
    let suffix = 1
    // eslint-disable-next-line no-await-in-loop
    while (await UserModel.exists({ username: name })) {
      suffix += 1
      name = `${baseName}-${suffix}`
    }
    return name
  }

  const createOrganizer = async () => {
    const username = await findAvailableUsername(BASE_USERNAME)
    const passwordHash = await hashPassword(DEFAULT_PASSWORD)
    const user = await UserModel.create({
      username,
      passwordHash,
      role: 'organizer',
      tournaments: [],
    })
    return { user, username }
  }

  const seedTournamentData = async (tournamentId: string, organizerId: string) => {
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const VenueModel = getVenueModel(connection)
    const SpeakerModel = getSpeakerModel(connection)
    const TeamModel = getTeamModel(connection)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const DrawModel = getDrawModel(connection)
    const SubmissionModel = getSubmissionModel(connection)

    await RoundModel.create({
      tournamentId,
      round: ROUND_NUMBER,
      name: 'Round 1',
      motions: ['This House would expand public transit'],
      teamAllocationOpened: true,
      adjudicatorAllocationOpened: true,
    })

    const [venueA, venueB] = await VenueModel.insertMany(
      [
        {
          tournamentId,
          name: 'Room A',
          details: [{ r: ROUND_NUMBER, available: true, priority: 1 }],
        },
        {
          tournamentId,
          name: 'Room B',
          details: [{ r: ROUND_NUMBER, available: true, priority: 1 }],
        },
      ],
      { ordered: true }
    )

    const teamSeeds = [
      { name: 'Team Alpha', speakers: ['Alice', 'Aiko', 'Aya'] },
      { name: 'Team Beta', speakers: ['Ben', 'Bella', 'Bao'] },
      { name: 'Team Gamma', speakers: ['Gina', 'George', 'Gao'] },
      { name: 'Team Delta', speakers: ['Dina', 'Diego', 'Daisuke'] },
    ]

    const seededTeams: Array<{
      name: string
      speakerIds: string[]
      speakerNames: string[]
    }> = []

    for (const seed of teamSeeds) {
      const speakerIds: string[] = []
      for (const speakerName of seed.speakers) {
        // eslint-disable-next-line no-await-in-loop
        const speaker = await SpeakerModel.create({ tournamentId, name: speakerName })
        speakerIds.push(String(speaker._id))
      }
      seededTeams.push({
        name: seed.name,
        speakerIds,
        speakerNames: seed.speakers,
      })
    }

    const teamDocs = seededTeams.map((seed) => ({
      tournamentId,
      name: seed.name,
      speakers: seed.speakerNames.map((name) => ({ name })),
      details: [
        {
          r: ROUND_NUMBER,
          available: true,
          speakers: seed.speakerIds,
          institutions: [],
        },
      ],
    }))

    const createdTeams = await TeamModel.insertMany(teamDocs, { ordered: true })

    const [adjA, adjB] = await AdjudicatorModel.insertMany(
      [
        {
          tournamentId,
          name: 'Judge 1',
          strength: 5,
          details: [{ r: ROUND_NUMBER, available: true }],
        },
        {
          tournamentId,
          name: 'Judge 2',
          strength: 4,
          details: [{ r: ROUND_NUMBER, available: true }],
        },
      ],
      { ordered: true }
    )

    await DrawModel.create({
      tournamentId,
      round: ROUND_NUMBER,
      allocation: [
        {
          venue: String(venueA._id),
          teams: { gov: String(createdTeams[0]._id), opp: String(createdTeams[1]._id) },
          chairs: [String(adjA._id)],
          panels: [],
          trainees: [],
        },
        {
          venue: String(venueB._id),
          teams: { gov: String(createdTeams[2]._id), opp: String(createdTeams[3]._id) },
          chairs: [String(adjB._id)],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
      locked: false,
      createdBy: organizerId,
    })

    const matchOneTeamA = createdTeams[0]
    const matchOneTeamB = createdTeams[1]
    const matchOneSpeakersA = seededTeams[0].speakerIds
    const matchOneSpeakersB = seededTeams[1].speakerIds

    await SubmissionModel.create({
      tournamentId,
      round: ROUND_NUMBER,
      type: 'ballot',
      payload: {
        teamAId: String(matchOneTeamA._id),
        teamBId: String(matchOneTeamB._id),
        winnerId: String(matchOneTeamA._id),
        speakerIdsA: matchOneSpeakersA,
        speakerIdsB: matchOneSpeakersB,
        scoresA: [78, 76, 38],
        scoresB: [74, 73, 36],
        comment: 'Seeded ballot for match 1',
        submittedEntityId: String(adjA._id),
      },
      submittedBy: organizerId,
    })

    return {
      teams: createdTeams.map((team) => ({ id: String(team._id), name: team.name })),
      adjudicators: [
        { id: String(adjA._id), name: adjA.name },
        { id: String(adjB._id), name: adjB.name },
      ],
    }
  }

  await connectDatabase()

  try {
    const { user, username } = await createOrganizer()

    const tournamentName = await findAvailableTournamentName(BASE_TOURNAMENT_NAME)
    const tournament = await TournamentModel.create({
      name: tournamentName,
      style: 2,
      options: {},
      total_round_num: 1,
      current_round_num: 1,
      createdBy: String(user._id),
    })

    await UserModel.updateOne(
      { _id: user._id },
      { $addToSet: { tournaments: String(tournament._id) } }
    )
    await TournamentMemberModel.updateOne(
      { tournamentId: String(tournament._id), userId: String(user._id) },
      { $set: { role: 'organizer' } },
      { upsert: true }
    ).exec()

    const seeded = await seedTournamentData(String(tournament._id), String(user._id))

    // eslint-disable-next-line no-console
    console.log('Mock data seeded')
    // eslint-disable-next-line no-console
    console.log('Tournament:', tournament.name, String(tournament._id))
    // eslint-disable-next-line no-console
    console.log('Organizer username:', username)
    // eslint-disable-next-line no-console
    console.log('Organizer password:', DEFAULT_PASSWORD)
    // eslint-disable-next-line no-console
    console.log('Teams:', seeded.teams)
    // eslint-disable-next-line no-console
    console.log('Adjudicators:', seeded.adjudicators)
  } finally {
    await closeTournamentConnections()
    await disconnectDatabase()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed mock data', err)
  process.exitCode = 1
})
