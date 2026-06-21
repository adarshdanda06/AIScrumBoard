import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://aiscrumboard:aiscrumboard@localhost:5432/aiscrumboard',
  },
  verbose: true,
  strict: true,
});
