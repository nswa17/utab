import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../../..')

dotenv.config({ path: path.join(rootDir, '.env') })
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(rootDir, '.env.development') })
}

const BASE_USERNAME = 'superuser'
const DEFAULT_PASSWORD = 'password123'

async function main() {
  const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
  const { UserModel } = await import('../models/user.js')
  const { hashPassword } = await import('../services/hash.service.js')

  const rawUsername = process.env.SUPERUSER_USERNAME || BASE_USERNAME
  const password = process.env.SUPERUSER_PASSWORD || DEFAULT_PASSWORD

  await connectDatabase()

  try {
    const existingSuperuser = await UserModel.findOne({ role: 'superuser' }).lean().exec()
    if (existingSuperuser) {
      // eslint-disable-next-line no-console
      console.log('Superuser already exists')
      // eslint-disable-next-line no-console
      console.log('Username:', existingSuperuser.username)
      return
    }

    if (await UserModel.exists({ username: rawUsername })) {
      throw new Error(`Username "${rawUsername}" is already used by a non-superuser account`)
    }

    const passwordHash = await hashPassword(password)
    const user = await UserModel.create({
      username: rawUsername,
      passwordHash,
      role: 'superuser',
      tournaments: [],
    })

    // eslint-disable-next-line no-console
    console.log('Superuser created')
    // eslint-disable-next-line no-console
    console.log('Username:', user.username)
    // eslint-disable-next-line no-console
    console.log('Password:', password)
  } finally {
    await disconnectDatabase()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to create superuser', err)
  process.exitCode = 1
})
