import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const venueDetailSchema = new Schema(
  {
    r: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'detail round must be an integer' },
    },
    available: { type: Boolean, default: true },
    priority: { type: Number, default: 1 },
  },
  { _id: false, strict: false }
)

const venueTemplateSchema = new Schema(
  {
    available: { type: Boolean, default: true },
    priority: { type: Number, default: 1 },
  },
  { _id: false, strict: false }
)

const venueSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    template: { type: venueTemplateSchema, default: () => ({}) },
    details: {
      type: [venueDetailSchema],
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

venueSchema.index({ tournamentId: 1, name: 1 }, { unique: true })

export type Venue = InferSchemaType<typeof venueSchema>

export function getVenueModel(conn: Connection): Model<Venue> {
  return (conn.models.Venue as Model<Venue> | undefined) ?? conn.model<Venue>('Venue', venueSchema)
}
