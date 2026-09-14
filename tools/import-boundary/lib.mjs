import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\bfrom\s+)?['"]([^'"]+)['"]/g

export function findImportSpecifiers(source) {
  const specifiers = []
  let match
  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(source))) {
    specifiers.push(match[1])
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
