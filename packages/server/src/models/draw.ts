import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const allocationRowSchema = new Schema(
  {
    venue: { type: String },
    teams: { type: Schema.Types.Mixed, required: true },
    chairs: { type: [String], default: [] },
    panels: { type: [String], default: [] },
    trainees: { type: [String], default: [] },
  },
  { _id: false }
)

const drawSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: { type: Number, required: true },
    allocation: { type: [allocationRowSchema], default: [] },
    drawOpened: { type: Boolean, default: false },
    allocationOpened: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    createdBy: { type: String },
  },
  { timestamps: true }
)

export type Draw = InferSchemaType<typeof drawSchema>

export function getDrawModel(conn: Connection): Model<Draw> {
  return (conn.models.Draw as Model<Draw> | undefined) ?? conn.model<Draw>('Draw', drawSchema)
}
