import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const resultSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: { type: Number, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String },
  },
  { timestamps: true }
)

export type Result = InferSchemaType<typeof resultSchema>

export function getResultModel(conn: Connection): Model<Result> {
  return (
    (conn.models.Result as Model<Result> | undefined) ?? conn.model<Result>('Result', resultSchema)
  )
}
