import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const rawTeamResultSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    id: { type: String, required: true },
    from_id: { type: String, required: true },
    r: { type: Number, required: true },
    weight: { type: Number, default: 1 },
    win: { type: Number, required: true },
    opponents: { type: [String], required: true },
    side: { type: String, required: true },
    user_defined_data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

rawTeamResultSchema.index({ tournamentId: 1, id: 1, from_id: 1, r: 1 }, { unique: true })

export type RawTeamResult = InferSchemaType<typeof rawTeamResultSchema>

export function getRawTeamResultModel(conn: Connection): Model<RawTeamResult> {
  return (
    (conn.models.RawTeamResult as Model<RawTeamResult> | undefined) ??
    conn.model<RawTeamResult>('RawTeamResult', rawTeamResultSchema)
  )
}
