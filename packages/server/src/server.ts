import dotenv from 'dotenv'
import { start } from './app.js'

dotenv.config()
start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to start server', err)
  process.exitCode = 1
})
