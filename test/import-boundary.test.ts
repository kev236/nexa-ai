import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectRepoFiles, findViolationsInFiles } from '../tools/import-boundary/lib.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const config = JSON.parse(readFileSync(join(repoRoot, 'tools/import-boundary/boundary.config.json'), 'utf8'))

describe('import boundary rule, against synthetic fixtures', () => {
  it('flags a restricted import from outside the allowed path', () => {
    const violations = findViolationsInFiles(
      [{ relPath: 'packages/some-agent/src/index.ts', source: `import { Pool } from 'pg'\n` }],
      config
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatch(/some-agent\/src\/index\.ts/)
    expect(violations[0]).toMatch(/"pg"/)
  })

  it('allows the same import from inside the executors path', () => {
    const violations = findViolationsInFiles(
      [
        {
          relPath: 'packages/permission-engine/src/executors/stripeExecutor.ts',
          source: `import Stripe from 'stripe'\n`,
        },
      ],
      config
    )
    expect(violations).toHaveLength(0)
  })

  it('does not flag an unrelated, non-restricted import', () => {
    const violations = findViolationsInFiles(
      [{ relPath: 'packages/some-agent/src/index.ts', source: `import { z } from 'zod'\n` }],
      config
    )
    expect(violations).toHaveLength(0)
  })

  it('catches a relative reach-around into the private executors module, not just the package name', () => {
    const violations = findViolationsInFiles(
      [
        {
          relPath: 'packages/some-agent/src/sneaky.ts',
          source: `import { registerExecutor } from '../../permission-engine/src/executors/registry.js'\nimport { Resend } from 'resend'\n`,
        },
      ],
      config
    )
    // The reach-around into registry.js isn't itself a restricted module
    // specifier (that's what package.json#exports + the private module
    // stop, layer 1 — see the package README). This check's job is the
    // credential-holding client import sitting right next to it.
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatch(/"resend"/)
  })
})

describe('import boundary rule, against the real repo', () => {
  it('finds zero violations in packages/ as it stands today', () => {
    const files = collectRepoFiles(repoRoot, config.scanRoots)
    const violations = findViolationsInFiles(files, config)
    expect(violations).toEqual([])
  })
})
