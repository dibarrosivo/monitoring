import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('.', import.meta.url));

/**
 * Pruebas de integración de la API: necesitan PostgreSQL. Usan una base
 * aparte (monitoring_test) que se crea, migra y vacía sola; nunca tocan la
 * base de desarrollo.
 */
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
    include: ['packages/api/pruebas/**/*.test.ts'],
    // Comparten la misma base: se ejecutan de a uno para no pisarse
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL_PRUEBAS ?? 'postgres://monitoring:monitoring@localhost:5433/monitoring_test',
      JWT_SECRETO: 'pruebas',
      NIVEL_LOG: 'silent',
    },
  },
});
