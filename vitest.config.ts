import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@monitoring/shared': `${raiz}packages/shared/src/index.ts`,
      '@monitoring/protocols': `${raiz}packages/protocols/src/index.ts`,
      '@monitoring/db': `${raiz}packages/db/src/index.ts`,
      '@monitoring/engine': `${raiz}packages/engine/src/index.ts`,
    },
  },
  test: {
    include: ['packages/*/pruebas/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    // Las de la API necesitan PostgreSQL: viven en vitest.integracion.config.ts
    exclude: ['**/node_modules/**', 'packages/api/pruebas/**'],
  },
});
