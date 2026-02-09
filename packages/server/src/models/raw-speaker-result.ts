import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const rawSpeakerResultSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    id: { type: String, required: true },
    from_id: { type: String, required: true },
    r: { type: Number, required: true },
    weight: { type: Number, default: 1 },
    scores: { type: [Number], required: true },
    user_defined_data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

rawSpeakerResultSchema.index({ tournamentId: 1, id: 1, from_id: 1, r: 1 }, { unique: true })

export type RawSpeakerResult = InferSchemaType<typeof rawSpeakerResultSchema>

export function getRawSpeakerResultModel(conn: Connection): Model<RawSpeakerResult> {
  return (
    (conn.models.RawSpeakerResult as Model<RawSpeakerResult> | undefined) ??
    conn.model<RawSpeakerResult>('RawSpeakerResult', rawSpeakerResultSchema)
  )
}
