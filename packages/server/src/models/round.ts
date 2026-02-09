import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const roundSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: { type: Number, required: true },
    name: { type: String, default: 'Round' },
    motions: { type: [String], default: [] },
    motionOpened: { type: Boolean, default: false },
    teamAllocationOpened: { type: Boolean, default: true },
    adjudicatorAllocationOpened: { type: Boolean, default: true },
    weightsOfAdjudicators: {
      chair: { type: Number, default: 1 },
      panel: { type: Number, default: 1 },
      trainee: { type: Number, default: 0 },
    },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

roundSchema.index({ tournamentId: 1, round: 1 }, { unique: true })

export type Round = InferSchemaType<typeof roundSchema>

export function getRoundModel(conn: Connection): Model<Round> {
  return (conn.models.Round as Model<Round> | undefined) ?? conn.model<Round>('Round', roundSchema)
}
