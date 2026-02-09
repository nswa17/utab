import { Schema, model, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    role: {
      type: String,
      enum: ['superuser', 'organizer', 'adjudicator', 'speaker', 'audience'],
      required: true,
    },
    passwordHash: { type: String, required: true },
    tournaments: [{ type: String }],
  },
  { timestamps: true }
)

export type User = InferSchemaType<typeof userSchema>
export const UserModel = model<User>('User', userSchema)
