import { Schema, model, type InferSchemaType } from 'mongoose'

const auditLogSchema = new Schema(
  {
    tournamentId: { type: String, index: true },
    action: { type: String, required: true, index: true },
    actorUserId: { type: String, index: true },
    actorRole: {
      type: String,
      enum: ['superuser', 'organizer', 'adjudicator', 'speaker', 'audience'],
      required: false,
    },
    targetType: { type: String, required: true, index: true },
    targetId: { type: String, required: false },
    ip: { type: String, required: false },
    userAgent: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

auditLogSchema.index({ tournamentId: 1, createdAt: -1, _id: -1 })
auditLogSchema.index({ action: 1, createdAt: -1, _id: -1 })
auditLogSchema.index({ actorUserId: 1, createdAt: -1, _id: -1 })
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1, _id: -1 })

export type AuditLog = InferSchemaType<typeof auditLogSchema>
export const AuditLogModel = model<AuditLog>('AuditLog', auditLogSchema)
