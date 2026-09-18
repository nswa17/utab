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
    entityType: {
      type: String,
      enum: ['team', 'speaker', 'adjudicator'],
      required: false,
    },
    entityId: { type: String, required: false },
  },
  { timestamps: true }
)

tournamentMemberSchema.index({ tournamentId: 1, userId: 1 }, { unique: true })
tournamentMemberSchema.index({ userId: 1, role: 1 })
tournamentMemberSchema.index({ tournamentId: 1, entityType: 1, entityId: 1 })

export type TournamentMember = InferSchemaType<typeof tournamentMemberSchema>
export const TournamentMemberModel = model<TournamentMember>(
  'TournamentMember',
  tournamentMemberSchema
)
