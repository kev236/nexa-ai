import tseslint from 'typescript-eslint'

// Deliberately minimal — typescript-eslint's own recommended rules, not
// the strict/stylistic presets. This repo leans on tsc (--strict) for
// correctness; lint here is for what tsc can't catch (unused vars,
// floating promises), not a style guide.
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/*.d.ts'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  }
)
