import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const teamDetailSchema = new Schema(
  {
    r: { type: Number, required: true },
    available: { type: Boolean, default: true },
    institutions: { type: [String], default: [] },
    speakers: { type: [String], default: [] },
  },
  { _id: false }
)

const teamSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    institution: { type: String },
    speakers: [{ name: { type: String, required: true } }],
    details: { type: [teamDetailSchema], default: [] },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

teamSchema.index({ tournamentId: 1, name: 1 }, { unique: true })

export type Team = InferSchemaType<typeof teamSchema>

export function getTeamModel(conn: Connection): Model<Team> {
  return (conn.models.Team as Model<Team> | undefined) ?? conn.model<Team>('Team', teamSchema)
}
