import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const teamDetailSchema = new Schema(
  {
    r: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'detail round must be an integer' },
    },
    available: { type: Boolean, default: true },
    conflicts: { type: [String], default: [] },
    speakers: { type: [String], default: [] },
  },
  { _id: false, strict: false }
)

const teamTemplateSchema = new Schema(
  {
    available: { type: Boolean, default: true },
    conflicts: { type: [String], default: [] },
    speakers: { type: [String], default: [] },
  },
  { _id: false, strict: false }
)

const teamSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    template: { type: teamTemplateSchema, default: () => ({}) },
    details: {
      type: [teamDetailSchema],
      default: [],
      validate: {
        validator: (details: Array<{ r?: number }>) => {
          const rounds = details.map((detail) => Number(detail?.r))
          return new Set(rounds).size === rounds.length
        },
        message: 'detail rounds must be unique',
      },
    },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

teamSchema.index({ tournamentId: 1, name: 1 }, { unique: true })

export type Team = InferSchemaType<typeof teamSchema>

export function getTeamModel(conn: Connection): Model<Team> {
  return (conn.models.Team as Model<Team> | undefined) ?? conn.model<Team>('Team', teamSchema)
}
