import { Schema, model, type InferSchemaType } from 'mongoose'

const tournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    style: { type: Number, required: true },
    options: { type: Schema.Types.Mixed, default: {} },
    total_round_num: { type: Number, default: 4 },
    current_round_num: { type: Number, default: 1 },
    preev_weights: { type: [Number], default: [0, 0, 0, 0, 0, 0] },
    auth: { type: Schema.Types.Mixed, default: { access: { required: false, version: 1 } } },
    user_defined_data: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: String, required: false },
  },
  { timestamps: true }
)

export type Tournament = InferSchemaType<typeof tournamentSchema>
export const TournamentModel = model<Tournament>('Tournament', tournamentSchema)
