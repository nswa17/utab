import { Schema, model, type InferSchemaType } from 'mongoose'

const erasureRequestSchema = new Schema(
  {
    tournamentId: { type: String, required: true, index: true },
    targetType: {
      type: String,
      enum: ['speaker', 'adjudicator'],
      required: true,
      index: true,
    },
    targetId: { type: String, required: true, index: true },
    eraseMode: {
      type: String,
      enum: ['anonymize', 'hard_delete'],
      required: true,
      default: 'anonymize',
    },
    reason: { type: String, required: true },
    targetRefs: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'running', 'completed', 'failed', 'cancelled'],
      required: true,
      default: 'requested',
      index: true,
    },
    requestedBy: { type: String, required: true, index: true },
    requestedAt: { type: Date, required: true, default: () => new Date() },
    approvedBy: { type: String, required: false },
    approvedAt: { type: Date, required: false },
    rejectedBy: { type: String, required: false },
    rejectedAt: { type: Date, required: false },
    rejectionReason: { type: String, required: false },
    executedBy: { type: String, required: false },
    executedAt: { type: Date, required: false },
    errorMessage: { type: String, required: false },
    result: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true }
)

erasureRequestSchema.index({ tournamentId: 1, createdAt: -1, _id: -1 })
erasureRequestSchema.index({ tournamentId: 1, status: 1, createdAt: -1, _id: -1 })
erasureRequestSchema.index({ tournamentId: 1, targetType: 1, targetId: 1, createdAt: -1, _id: -1 })
erasureRequestSchema.index({ tournamentId: 1, requestedBy: 1, createdAt: -1, _id: -1 })

export type ErasureRequest = InferSchemaType<typeof erasureRequestSchema>
export const ErasureRequestModel = model<ErasureRequest>('ErasureRequest', erasureRequestSchema)
