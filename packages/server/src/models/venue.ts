import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const venueDetailSchema = new Schema(
  {
    r: { type: Number, required: true },
    available: { type: Boolean, default: true },
    priority: { type: Number, default: 1 },
  },
  { _id: false }
)

const venueSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    name: { type: String, required: true },
    details: { type: [venueDetailSchema], default: [] },
    userDefinedData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

venueSchema.index({ tournamentId: 1, name: 1 }, { unique: true })

export type Venue = InferSchemaType<typeof venueSchema>

export function getVenueModel(conn: Connection): Model<Venue> {
  return (conn.models.Venue as Model<Venue> | undefined) ?? conn.model<Venue>('Venue', venueSchema)
}
