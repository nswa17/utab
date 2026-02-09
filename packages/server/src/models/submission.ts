import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'

const submissionSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: { type: Number, required: true },
    type: { type: String, enum: ['ballot', 'feedback'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    submittedBy: { type: String },
  },
  { timestamps: true }
)

export type Submission = InferSchemaType<typeof submissionSchema>

export function getSubmissionModel(conn: Connection): Model<Submission> {
  return (
    (conn.models.Submission as Model<Submission> | undefined) ??
    conn.model<Submission>('Submission', submissionSchema)
  )
}
