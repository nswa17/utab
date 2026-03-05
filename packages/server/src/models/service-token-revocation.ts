import { Schema, model, type InferSchemaType } from 'mongoose'

const serviceTokenRevocationSchema = new Schema(
  {
    jti: { type: String, required: true, unique: true },
    reason: { type: String, required: false },
    revokedBy: { type: String, required: false },
    revokedAt: { type: Date, required: true, default: () => new Date() },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true }
)

serviceTokenRevocationSchema.index({ revokedAt: -1 })
serviceTokenRevocationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })

export type ServiceTokenRevocation = InferSchemaType<typeof serviceTokenRevocationSchema>
export const ServiceTokenRevocationModel = model<ServiceTokenRevocation>(
  'ServiceTokenRevocation',
  serviceTokenRevocationSchema
)
