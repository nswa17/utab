import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const compiledSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String },
  },
  { timestamps: true }
)

export type CompiledResult = InferSchemaType<typeof compiledSchema>

export function getCompiledModel(conn: Connection): Model<CompiledResult> {
  return (
    (conn.models.CompiledResult as Model<CompiledResult> | undefined) ??
    conn.model<CompiledResult>('CompiledResult', compiledSchema)
  )
}
