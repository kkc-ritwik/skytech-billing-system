import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { migrate } from 'drizzle-orm/libsql/migrator'
import type { DB } from './client'

/**
 * Resolves the bundled migrations folder in both dev and packaged builds.
 * - dev: <projectRoot>/src/main/db/migrations
 * - packaged: <resources>/migrations  (copied via electron-builder extraResources)
 *
 * Migrations are generated with `npm run db:generate` (drizzle-kit) and committed.
 */
function resolveMigrationsFolder(): string {
  const rel = ['src', 'main', 'db', 'migrations']
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'migrations')]
    : [
        join(app.getAppPath(), ...rel),
        join(process.cwd(), ...rel),
        join(__dirname, '..', '..', ...rel)
      ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

export async function runMigrations(db: DB): Promise<void> {
  const folder = resolveMigrationsFolder()
  if (!existsSync(folder)) {
    throw new Error(
      `Migrations folder not found at "${folder}". Run "npm run db:generate" before starting.`
    )
  }
  await migrate(db, { migrationsFolder: folder })
}
