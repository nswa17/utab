import { Schema, model, type InferSchemaType } from 'mongoose'

const styleSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    team_num: { type: Number, required: false },
    score_weights: { type: Schema.Types.Mixed, required: true },
    side_labels: {
      type: Schema.Types.Mixed,
      default: { gov: 'Government', opp: 'Opposition' },
    },
    side_labels_short: { type: Schema.Types.Mixed, default: { gov: 'Gov', opp: 'Opp' } },
    speaker_sequence: { type: Schema.Types.Mixed, required: true },
    range: { type: [Schema.Types.Mixed], default: [] },
    adjudicator_range: { type: Schema.Types.Mixed, required: true },
    roles: { type: Schema.Types.Mixed, required: true },
    user_defined_data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

export type Style = InferSchemaType<typeof styleSchema>
export const StyleModel = model<Style>('Style', styleSchema)
