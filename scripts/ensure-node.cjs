#!/usr/bin/env node

const major = Number(process.versions.node.split('.')[0])

if (major < 20) {
  console.error(
    `[utab] Node.js >=20 is required for tests (detected ${process.version}). ` +
      'Use Node 24 LTS if possible (`pnpm env use --global 24`).'
  )
  process.exit(1)
}
