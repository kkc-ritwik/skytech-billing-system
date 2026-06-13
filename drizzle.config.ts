import { defineConfig } from 'drizzle-kit'

// Drizzle Kit is used at build time only, to generate SQL migration files from
// the schema. The migrations are bundled and applied at runtime by the app
// against the user's local SQLite database (see src/main/db/migrate.ts).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema/index.ts',
  out: './src/main/db/migrations',
  verbose: true,
  strict: true
})
