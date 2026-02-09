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

const ORGANIZER_USERNAME = 'test'
const ORGANIZER_PASSWORD = 'test'
const SUPERUSER_USERNAME = 'rn375'
const SUPERUSER_PASSWORD = 'ryn552'
const TOURNAMENT_NAME = 'Organizer Demo Tournament'
const TOURNAMENT_SEED_KEY = 'organizer-demo-v1'
const STYLE_ID = 2

type SeededTeam = {
  id: string
  name: string
  speakerIds: string[]
}

type SeededAdjudicator = {
  id: string
  name: string
}

type SeededVenue = {
  id: string
  name: string
}

async function main() {
  const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
  const { TournamentModel } = await import('../models/tournament.js')
  const { TournamentMemberModel } = await import('../models/tournament-member.js')
  const { UserModel } = await import('../models/user.js')
  const { hashPassword } = await import('../services/hash.service.js')
  const { closeTournamentConnections, getTournamentConnection } = await import(
    '../services/tournament-db.service.js'
  )
  const { getInstitutionModel } = await import('../models/institution.js')
  const { getTeamModel } = await import('../models/team.js')
  const { getSpeakerModel } = await import('../models/speaker.js')
  const { getAdjudicatorModel } = await import('../models/adjudicator.js')
  const { getRoundModel } = await import('../models/round.js')
  const { getDrawModel } = await import('../models/draw.js')
  const { getVenueModel } = await import('../models/venue.js')
  const { getSubmissionModel } = await import('../models/submission.js')
  const { getRawTeamResultModel } = await import('../models/raw-team-result.js')
  const { getRawSpeakerResultModel } = await import('../models/raw-speaker-result.js')
  const { getRawAdjudicatorResultModel } = await import('../models/raw-adjudicator-result.js')
  const { getResultModel } = await import('../models/result.js')
  const { getCompiledModel } = await import('../models/compiled.js')

  await connectDatabase()

  try {
    const organizerPasswordHash = await hashPassword(ORGANIZER_PASSWORD)
    const organizer =
      (await UserModel.findOneAndUpdate(
        { username: ORGANIZER_USERNAME },
        {
          $set: {
            username: ORGANIZER_USERNAME,
            passwordHash: organizerPasswordHash,
            role: 'organizer',
          },
          $setOnInsert: {
            tournaments: [],
          },
        },
        { upsert: true, new: true }
      )
        .lean()
        .exec()) ??
      (await UserModel.findOne({ username: ORGANIZER_USERNAME }).lean().exec())

    if (!organizer) {
      throw new Error('Failed to create organizer user')
    }

    const superuserPasswordHash = await hashPassword(SUPERUSER_PASSWORD)
    await UserModel.findOneAndUpdate(
      { username: SUPERUSER_USERNAME },
      {
        $set: {
          username: SUPERUSER_USERNAME,
          passwordHash: superuserPasswordHash,
          role: 'superuser',
        },
        $setOnInsert: {
          tournaments: [],
        },
      },
      { upsert: true, new: true }
    ).exec()

    const tournamentAuth = { access: { required: false, version: 1 } }
    const tournamentUserData = {
      seed_key: TOURNAMENT_SEED_KEY,
      hidden: false,
      info: {
        text: '# 重要なお知らせ\n\nこの大会は UI 確認用のダミーデータです。',
        time: new Date().toISOString(),
      },
    }

    const tournament =
      (await TournamentModel.findOneAndUpdate(
        { 'user_defined_data.seed_key': TOURNAMENT_SEED_KEY },
        {
          $set: {
            name: TOURNAMENT_NAME,
            style: STYLE_ID,
            options: {},
            total_round_num: 2,
            current_round_num: 2,
            auth: tournamentAuth,
            user_defined_data: tournamentUserData,
            createdBy: String(organizer._id),
          },
        },
        { upsert: true, new: true }
      )
        .lean()
        .exec()) ??
      (await TournamentModel.findOne({ 'user_defined_data.seed_key': TOURNAMENT_SEED_KEY }).lean().exec())

    if (!tournament) {
      throw new Error('Failed to create demo tournament')
    }

    const tournamentId = String(tournament._id)
    const organizerId = String(organizer._id)

    await UserModel.updateOne({ _id: organizer._id }, { $addToSet: { tournaments: tournamentId } }).exec()
    await TournamentMemberModel.updateOne(
      { tournamentId, userId: organizerId },
      { $set: { role: 'organizer' } },
      { upsert: true }
    ).exec()

    const connection = await getTournamentConnection(tournamentId)
    const InstitutionModel = getInstitutionModel(connection)
    const TeamModel = getTeamModel(connection)
    const SpeakerModel = getSpeakerModel(connection)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const RoundModel = getRoundModel(connection)
    const DrawModel = getDrawModel(connection)
    const VenueModel = getVenueModel(connection)
    const SubmissionModel = getSubmissionModel(connection)
    const RawTeamResultModel = getRawTeamResultModel(connection)
    const RawSpeakerResultModel = getRawSpeakerResultModel(connection)
    const RawAdjudicatorResultModel = getRawAdjudicatorResultModel(connection)
    const ResultModel = getResultModel(connection)
    const CompiledModel = getCompiledModel(connection)

    await Promise.all([
      DrawModel.deleteMany({ tournamentId }).exec(),
      SubmissionModel.deleteMany({ tournamentId }).exec(),
      RawTeamResultModel.deleteMany({ tournamentId }).exec(),
      RawSpeakerResultModel.deleteMany({ tournamentId }).exec(),
      RawAdjudicatorResultModel.deleteMany({ tournamentId }).exec(),
      ResultModel.deleteMany({ tournamentId }).exec(),
      CompiledModel.deleteMany({ tournamentId }).exec(),
      TeamModel.deleteMany({ tournamentId }).exec(),
      SpeakerModel.deleteMany({ tournamentId }).exec(),
      AdjudicatorModel.deleteMany({ tournamentId }).exec(),
      InstitutionModel.deleteMany({ tournamentId }).exec(),
      VenueModel.deleteMany({ tournamentId }).exec(),
      RoundModel.deleteMany({ tournamentId }).exec(),
    ])

    const [instA, instB] = await InstitutionModel.insertMany(
      [
        { tournamentId, name: 'University A' },
        { tournamentId, name: 'University B' },
      ],
      { ordered: true }
    )

    const [venueA, venueB] = (await VenueModel.insertMany(
      [
        {
          tournamentId,
          name: 'Room A',
          details: [
            { r: 1, available: true, priority: 1 },
            { r: 2, available: true, priority: 1 },
          ],
        },
        {
          tournamentId,
          name: 'Room B',
          details: [
            { r: 1, available: true, priority: 2 },
            { r: 2, available: true, priority: 2 },
          ],
        },
      ],
      { ordered: true }
    )) as unknown as Array<{ _id: unknown; name: string }>

    await RoundModel.insertMany(
      [
        {
          tournamentId,
          round: 1,
          name: 'Round 1',
          motions: ['This House would expand public transit subsidies.'],
          teamAllocationOpened: true,
          adjudicatorAllocationOpened: true,
          userDefinedData: {
            hidden: false,
            evaluate_from_adjudicators: true,
            evaluate_from_teams: true,
            evaluator_in_team: 'team',
            score_by_matter_manner: false,
          },
        },
        {
          tournamentId,
          round: 2,
          name: 'Round 2',
          motions: ['This House supports mandatory climate disclosure for all listed companies.'],
          teamAllocationOpened: true,
          adjudicatorAllocationOpened: true,
          userDefinedData: {
            hidden: false,
            evaluate_from_adjudicators: true,
            evaluate_from_teams: true,
            evaluator_in_team: 'team',
            score_by_matter_manner: false,
          },
        },
      ],
      { ordered: true }
    )

    const teamSeeds = [
      { name: 'Team Alpha', institutionName: instA.name, institutionId: String(instA._id), speakers: ['Alice', 'Aiko', 'Aya'] },
      { name: 'Team Beta', institutionName: instB.name, institutionId: String(instB._id), speakers: ['Ben', 'Bella', 'Bao'] },
      { name: 'Team Gamma', institutionName: instA.name, institutionId: String(instA._id), speakers: ['Gina', 'George', 'Gao'] },
      { name: 'Team Delta', institutionName: instB.name, institutionId: String(instB._id), speakers: ['Dina', 'Diego', 'Daisuke'] },
    ]

    const seededTeams: SeededTeam[] = []
    for (const seed of teamSeeds) {
      const speakerIds: string[] = []
      for (const speakerName of seed.speakers) {
        // eslint-disable-next-line no-await-in-loop
        const speaker = await SpeakerModel.create({ tournamentId, name: speakerName })
        speakerIds.push(String(speaker._id))
      }
      // eslint-disable-next-line no-await-in-loop
      const team = await TeamModel.create({
        tournamentId,
        name: seed.name,
        institution: seed.institutionName,
        speakers: seed.speakers.map((name) => ({ name })),
        details: [
          { r: 1, available: true, institutions: [seed.institutionId], speakers: speakerIds },
          { r: 2, available: true, institutions: [seed.institutionId], speakers: speakerIds },
        ],
      })
      seededTeams.push({ id: String(team._id), name: seed.name, speakerIds })
    }

    const [adjA, adjB] = (await AdjudicatorModel.insertMany(
      [
        {
          tournamentId,
          name: 'Judge 1',
          strength: 5,
          active: true,
          preev: 0,
          details: [
            { r: 1, available: true, institutions: [String(instA._id)], conflicts: [] },
            { r: 2, available: true, institutions: [String(instA._id)], conflicts: [] },
          ],
        },
        {
          tournamentId,
          name: 'Judge 2',
          strength: 4,
          active: true,
          preev: 0,
          details: [
            { r: 1, available: true, institutions: [String(instB._id)], conflicts: [] },
            { r: 2, available: true, institutions: [String(instB._id)], conflicts: [] },
          ],
        },
      ],
      { ordered: true }
    )) as unknown as Array<{ _id: unknown; name: string }>

    const seededAdjudicators: SeededAdjudicator[] = [
      { id: String(adjA._id), name: adjA.name },
      { id: String(adjB._id), name: adjB.name },
    ]
    const seededVenues: SeededVenue[] = [
      { id: String(venueA._id), name: venueA.name },
      { id: String(venueB._id), name: venueB.name },
    ]

    await DrawModel.insertMany(
      [
        {
          tournamentId,
          round: 1,
          allocation: [
            {
              venue: seededVenues[0].id,
              teams: { gov: seededTeams[0].id, opp: seededTeams[1].id },
              chairs: [seededAdjudicators[0].id],
              panels: [],
              trainees: [],
            },
            {
              venue: seededVenues[1].id,
              teams: { gov: seededTeams[2].id, opp: seededTeams[3].id },
              chairs: [seededAdjudicators[1].id],
              panels: [],
              trainees: [],
            },
          ],
          drawOpened: true,
          allocationOpened: true,
          locked: false,
          createdBy: organizerId,
        },
        {
          tournamentId,
          round: 2,
          allocation: [
            {
              venue: seededVenues[0].id,
              teams: { gov: seededTeams[0].id, opp: seededTeams[2].id },
              chairs: [seededAdjudicators[1].id],
              panels: [],
              trainees: [],
            },
            {
              venue: seededVenues[1].id,
              teams: { gov: seededTeams[1].id, opp: seededTeams[3].id },
              chairs: [seededAdjudicators[0].id],
              panels: [],
              trainees: [],
            },
          ],
          drawOpened: true,
          allocationOpened: true,
          locked: false,
          createdBy: organizerId,
        },
      ],
      { ordered: true }
    )

    await SubmissionModel.insertMany(
      [
        {
          tournamentId,
          round: 1,
          type: 'ballot',
          payload: {
            teamAId: seededTeams[0].id,
            teamBId: seededTeams[1].id,
            winnerId: seededTeams[0].id,
            speakerIdsA: seededTeams[0].speakerIds,
            speakerIdsB: seededTeams[1].speakerIds,
            scoresA: [78, 76, 38],
            scoresB: [74, 73, 36],
            comment: 'Round 1 Match 1 ballot',
            submittedEntityId: seededAdjudicators[0].id,
          },
          submittedBy: organizerId,
        },
        {
          tournamentId,
          round: 1,
          type: 'ballot',
          payload: {
            teamAId: seededTeams[2].id,
            teamBId: seededTeams[3].id,
            winnerId: seededTeams[3].id,
            speakerIdsA: seededTeams[2].speakerIds,
            speakerIdsB: seededTeams[3].speakerIds,
            scoresA: [73, 72, 36],
            scoresB: [77, 76, 38],
            comment: 'Round 1 Match 2 ballot',
            submittedEntityId: seededAdjudicators[1].id,
          },
          submittedBy: organizerId,
        },
        {
          tournamentId,
          round: 1,
          type: 'feedback',
          payload: {
            adjudicatorId: seededAdjudicators[0].id,
            score: 8,
            comment: 'Clear and fair adjudication.',
            submittedEntityId: seededTeams[0].id,
          },
          submittedBy: organizerId,
        },
        {
          tournamentId,
          round: 1,
          type: 'feedback',
          payload: {
            adjudicatorId: seededAdjudicators[1].id,
            score: 9,
            comment: 'Strong explanation and time control.',
            submittedEntityId: seededTeams[3].id,
          },
          submittedBy: organizerId,
        },
      ],
      { ordered: true }
    )

    await RawTeamResultModel.insertMany(
      [
        {
          tournamentId,
          id: seededTeams[0].id,
          from_id: seededAdjudicators[0].id,
          r: 1,
          win: 1,
          opponents: [seededTeams[1].id],
          side: 'gov',
        },
        {
          tournamentId,
          id: seededTeams[1].id,
          from_id: seededAdjudicators[0].id,
          r: 1,
          win: 0,
          opponents: [seededTeams[0].id],
          side: 'opp',
        },
        {
          tournamentId,
          id: seededTeams[2].id,
          from_id: seededAdjudicators[1].id,
          r: 1,
          win: 0,
          opponents: [seededTeams[3].id],
          side: 'gov',
        },
        {
          tournamentId,
          id: seededTeams[3].id,
          from_id: seededAdjudicators[1].id,
          r: 1,
          win: 1,
          opponents: [seededTeams[2].id],
          side: 'opp',
        },
      ],
      { ordered: true }
    )

    const rawSpeakerRows = seededTeams.flatMap((team, teamIndex) =>
      team.speakerIds.map((speakerId, order) => ({
        tournamentId,
        id: speakerId,
        from_id: teamIndex < 2 ? seededAdjudicators[0].id : seededAdjudicators[1].id,
        r: 1,
        scores: [72 + order + (teamIndex % 2 === 0 ? 3 : 1)],
      }))
    )
    await RawSpeakerResultModel.insertMany(rawSpeakerRows, { ordered: true })

    await RawAdjudicatorResultModel.insertMany(
      [
        {
          tournamentId,
          id: seededAdjudicators[0].id,
          from_id: seededTeams[0].id,
          r: 1,
          score: 8,
          judged_teams: [seededTeams[0].id, seededTeams[1].id],
          comment: 'Good adjudication quality.',
        },
        {
          tournamentId,
          id: seededAdjudicators[1].id,
          from_id: seededTeams[3].id,
          r: 1,
          score: 9,
          judged_teams: [seededTeams[2].id, seededTeams[3].id],
          comment: 'Very clear feedback.',
        },
      ],
      { ordered: true }
    )

    await ResultModel.create({
      tournamentId,
      round: 1,
      createdBy: organizerId,
      payload: {
        standings: [
          { name: seededTeams[0].name, rank: 1, points: 1 },
          { name: seededTeams[3].name, rank: 2, points: 1 },
          { name: seededTeams[1].name, rank: 3, points: 0 },
          { name: seededTeams[2].name, rank: 4, points: 0 },
        ],
      },
    })

    // eslint-disable-next-line no-console
    console.log('Organizer demo data seeded')
    // eslint-disable-next-line no-console
    console.log('Organizer username:', ORGANIZER_USERNAME)
    // eslint-disable-next-line no-console
    console.log('Organizer password:', ORGANIZER_PASSWORD)
    // eslint-disable-next-line no-console
    console.log('Superuser username:', SUPERUSER_USERNAME)
    // eslint-disable-next-line no-console
    console.log('Superuser password:', SUPERUSER_PASSWORD)
    // eslint-disable-next-line no-console
    console.log('Tournament:', TOURNAMENT_NAME)
    // eslint-disable-next-line no-console
    console.log('Tournament ID:', tournamentId)
    // eslint-disable-next-line no-console
    console.log('Round status: 2 rounds created, round 1 submissions/results seeded')
  } finally {
    await closeTournamentConnections()
    await disconnectDatabase()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed organizer demo data', err)
  process.exitCode = 1
})
