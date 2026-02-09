import dotenv from 'dotenv'
import { connectDatabase, disconnectDatabase } from '../config/database.js'
import { StyleModel } from '../models/style.js'
import { seedStyles } from '../seed/styles.js'

dotenv.config()

async function main() {
  await connectDatabase()
  await StyleModel.deleteMany({})
  await seedStyles()
  await disconnectDatabase()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to reset styles', err)
  process.exitCode = 1
})
