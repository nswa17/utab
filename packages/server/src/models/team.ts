import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const teamDetailSchema = new Schema(
  {
    r: { type: Number, required: true },
    available: { type: Boolean, default: true },
    conflicts: { type: [String], default: [] },
    speakers: { type: [String], default: [] },
  },
  { _id: false }
)

const teamTemplateSchema = new Schema(
  {
    available: { type: Boolean, default: true },
    conflicts: { type: [String], default: [] },
    speakers: { type: [String], default: [] },
  },
  { _id: false }
)

const teamSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    template: { type: teamTemplateSchema, default: () => ({}) },
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
