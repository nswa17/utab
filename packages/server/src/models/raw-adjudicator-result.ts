import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const rawAdjudicatorResultSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    id: { type: String, required: true },
    from_id: { type: String, required: true },
    r: { type: Number, required: true },
    weight: { type: Number, default: 1 },
    score: { type: Number, required: true },
    judged_teams: { type: [String], required: true },
    comment: { type: String, default: '' },
    user_defined_data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

rawAdjudicatorResultSchema.index({ tournamentId: 1, id: 1, from_id: 1, r: 1 }, { unique: true })

export type RawAdjudicatorResult = InferSchemaType<typeof rawAdjudicatorResultSchema>

export function getRawAdjudicatorResultModel(conn: Connection): Model<RawAdjudicatorResult> {
  return (
    (conn.models.RawAdjudicatorResult as Model<RawAdjudicatorResult> | undefined) ??
    conn.model<RawAdjudicatorResult>('RawAdjudicatorResult', rawAdjudicatorResultSchema)
  )
}
