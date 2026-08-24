import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/esquema.ts',
  out: './migraciones',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://monitoring:monitoring@localhost:5433/monitoring',
  },
});
