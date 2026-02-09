import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const speakerSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

speakerSchema.index({ tournamentId: 1, name: 1 }, { unique: true })

export type Speaker = InferSchemaType<typeof speakerSchema>

export function getSpeakerModel(conn: Connection): Model<Speaker> {
  return (
    (conn.models.Speaker as Model<Speaker> | undefined) ??
    conn.model<Speaker>('Speaker', speakerSchema)
  )
}
