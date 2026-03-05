import 'dotenv/config'
import { start } from './app.js'

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to start server', err)
  process.exitCode = 1
})
