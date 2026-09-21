import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const compiledSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (payload: any) => {
          const tiePoints = payload?.compile_options?.tie_points
          return (
            tiePoints === undefined ||
            (typeof tiePoints === 'number' &&
              Number.isFinite(tiePoints) &&
              tiePoints >= 0 &&
              tiePoints <= 1)
          )
        },
        message: 'compile_options.tie_points must be a finite number in [0, 1]',
      },
    },
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
