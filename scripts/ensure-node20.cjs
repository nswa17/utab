#!/usr/bin/env node

const major = Number(process.versions.node.split('.')[0])

if (major !== 20) {
  console.error(
    `[utab] Node.js 20.x is required for tests (detected ${process.version}). ` +
      'Use `pnpm env use --global 20.19.0` or switch via nvm.'
  )
  process.exit(1)
}
