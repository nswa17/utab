import { Schema, model, type InferSchemaType } from 'mongoose'

const serviceAccountIdempotencySchema = new Schema(
  {
    actorId: { type: String, required: true },
    orgId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    method: { type: String, required: true, enum: ['POST', 'PATCH', 'DELETE'] },
    path: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
    },
    responseStatus: { type: Number, required: false },
    responseBody: { type: Schema.Types.Mixed, required: false },
    completedAt: { type: Date, required: false },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true }
)

serviceAccountIdempotencySchema.index({ actorId: 1, idempotencyKey: 1 }, { unique: true })
serviceAccountIdempotencySchema.index({ orgId: 1, createdAt: -1 })
serviceAccountIdempotencySchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })

export type ServiceAccountIdempotencyRecord = InferSchemaType<typeof serviceAccountIdempotencySchema>
export const ServiceAccountIdempotencyModel = model<ServiceAccountIdempotencyRecord>(
  'ServiceAccountIdempotency',
  serviceAccountIdempotencySchema
)
