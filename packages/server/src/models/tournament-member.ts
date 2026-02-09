import { Schema, model, type InferSchemaType } from 'mongoose'

const tournamentMemberSchema = new Schema(
  {
    tournamentId: { type: String, required: true },
    userId: { type: String, required: true },
    role: {
      type: String,
      enum: ['organizer', 'adjudicator', 'speaker', 'audience'],
      required: true,
    },
  },
  { timestamps: true }
)

tournamentMemberSchema.index({ tournamentId: 1, userId: 1 }, { unique: true })
tournamentMemberSchema.index({ userId: 1, role: 1 })

export type TournamentMember = InferSchemaType<typeof tournamentMemberSchema>
export const TournamentMemberModel = model<TournamentMember>(
  'TournamentMember',
  tournamentMemberSchema
)
