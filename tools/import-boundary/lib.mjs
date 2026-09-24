import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\bfrom\s+)?['"]([^'"]+)['"]/g
// The static-syntax regex above requires "import"/"export" followed by
// whitespace, so it never matches import(...) — a function call, not a
// declaration — which silently evaded the whole boundary check: a
// restricted module dynamically imported from outside allowedPaths
// passed clean. require(...) added for the same reason, even though
// this is an ESM codebase where it's less likely to appear.
const DYNAMIC_IMPORT_RE = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g

export function findImportSpecifiers(source) {
  const specifiers = []
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(source))) {
      specifiers.push(match[1])
    }
  }
  return specifiers
}

export function isRestrictedImport(specifier, restrictedImports) {
  return restrictedImports.some((banned) => specifier === banned || specifier.startsWith(`${banned}/`))
}

export function isAllowedPath(relPath, allowedPaths) {
  return allowedPaths.some((prefix) => relPath.startsWith(prefix))
}

/**
 * files: [{ relPath, source }]
 * config: { allowedPaths, restrictedImports }
 * Returns an array of human-readable violation strings — empty means clean.
 */
export function findViolationsInFiles(files, config) {
  const violations = []
  for (const { relPath, source } of files) {
    if (isAllowedPath(relPath, config.allowedPaths)) continue
    for (const specifier of findImportSpecifiers(source)) {
      if (isRestrictedImport(specifier, config.restrictedImports)) {
        violations.push(`${relPath} imports restricted module "${specifier}"`)
      }
    }
  }
  return violations
}

export function collectRepoFiles(repoRoot, scanRoots) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        const relPath = relative(repoRoot, full).split('\\').join('/')
        files.push({ relPath, source: readFileSync(full, 'utf8') })
      }
    }
  }
  for (const root of scanRoots) {
    walk(join(repoRoot, root))
  }
  return files
}
