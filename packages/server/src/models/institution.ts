import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const institutionSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

institutionSchema.index({ tournamentId: 1, name: 1 }, { unique: true })

export type Institution = InferSchemaType<typeof institutionSchema>

export function getInstitutionModel(conn: Connection): Model<Institution> {
  return (
    (conn.models.Institution as Model<Institution> | undefined) ??
    conn.model<Institution>('Institution', institutionSchema)
  )
}
