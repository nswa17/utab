import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const roundSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'round must be an integer' },
    },
    name: { type: String, default: 'Round' },
    motions: { type: [String], default: [] },
    motionOpened: { type: Boolean, default: false },
    teamAllocationOpened: { type: Boolean, default: false },
    adjudicatorAllocationOpened: { type: Boolean, default: false },
    weightsOfAdjudicators: {
      chair: { type: Number, default: 1 },
      panel: { type: Number, default: 1 },
      trainee: { type: Number, default: 0 },
    },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
    roundActiveWriteCount: { type: Number, default: 0, select: false },
    roundActiveWriteTouchedAt: { type: Date, default: null, select: false },
    roundMutationLocked: { type: Boolean, default: false, select: false },
    roundMutationEpoch: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
)

roundSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.roundActiveWriteCount
    delete ret.roundActiveWriteTouchedAt
    delete ret.roundMutationLocked
    delete ret.roundMutationEpoch
    return ret
  },
})

roundSchema.index({ tournamentId: 1, round: 1 }, { unique: true })

export type Round = InferSchemaType<typeof roundSchema>

export function getRoundModel(conn: Connection): Model<Round> {
  return (conn.models.Round as Model<Round> | undefined) ?? conn.model<Round>('Round', roundSchema)
}
