#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { collectRepoFiles, findViolationsInFiles } from './lib.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const config = JSON.parse(readFileSync(join(repoRoot, 'tools/import-boundary/boundary.config.json'), 'utf8'))

const files = collectRepoFiles(repoRoot, config.scanRoots)
const violations = findViolationsInFiles(files, config)

if (violations.length > 0) {
  console.error(`Import boundary violations (invariant #1 — see docs/plan-001-foundations.md section 3b):\n`)
  for (const violation of violations) console.error(`  - ${violation}`)
  console.error(
    `\n${violations.length} violation(s). Credential-holding modules may only be imported from: ` +
      config.allowedPaths.join(', ')
  )
  process.exit(1)
} else {
  console.log(`Import boundary check passed (${files.length} files scanned under ${config.scanRoots.join(', ')}).`)
}
