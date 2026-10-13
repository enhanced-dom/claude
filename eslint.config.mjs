import { eslintConfigFactory } from '@enhanced-dom/lint'

// ignore must be an explicit array — eslintConfigFactory sets `ignores: ignore` on every
// config block, and ESLint 9's flat-config validator rejects `ignores: undefined`.
export default eslintConfigFactory({ env: ['node'], ignore: [] })
