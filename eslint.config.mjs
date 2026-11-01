import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ESLint was added to this repo after most of the code was written. These
    // React Compiler-era rules flag patterns in existing pages that work today;
    // they warn rather than fail so `npm run lint` gates new code without a
    // repo-wide rewrite. Tighten back to errors as those pages are touched.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'scripts/**', '.claude/**', '.claire/**']),
])
