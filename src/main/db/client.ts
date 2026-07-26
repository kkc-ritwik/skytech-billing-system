import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, existsSync, readdirSync, copyFileSync, statSync } from 'fs'
import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type DB = LibSQLDatabase<typeof schema>
/** A transaction handle, structurally usable anywhere a DB is expected. */
export type Txn = Parameters<Parameters<DB['transaction']>[0]>[0]
export type DbOrTx = DB | Txn

let client: Client | null = null
let db: DB | null = null

/** Data folders used by earlier product names, newest first. */
const LEGACY_APP_FOLDERS = ['skytech-billing', 'ledgerline']

/**
 * Carry a customer's data across a product rename.
 *
 * Electron derives `userData` from the app name, so renaming the product points
 * the app at an empty folder and the customer sees a blank system with their
 * licence gone. On first launch after a rename we copy the previous folder's
 * database (and its WAL sidecars, licence lock and window state) across.
 *
 * Copy, never move: if anything goes wrong the customer's original data is
 * still sitting untouched in the old folder.
 */
function migrateLegacyUserData(target: string): void {
  if (existsSync(join(target, 'ledgerline.db'))) return // already migrated or fresh install with data

  const parent = dirname(target)
  for (const legacy of LEGACY_APP_FOLDERS) {
    const from = join(parent, legacy)
    if (from === target || !existsSync(join(from, 'ledgerline.db'))) continue

    try {
      mkdirSync(target, { recursive: true })
      for (const name of readdirSync(from)) {
        // Only live business state: the database and its WAL sidecars, the
        // licence lock and the window position. Not Chromium's caches, and not
        // stale .bak copies left behind by earlier maintenance.
        const wanted =
          name === 'ledgerline.db' ||
          name === 'ledgerline.db-wal' ||
          name === 'ledgerline.db-shm' ||
          name === '.ll_license.lock' ||
          name === 'window-state.json'
        if (!wanted) continue
        const src = join(from, name)
        if (!statSync(src).isFile()) continue
        copyFileSync(src, join(target, name))
      }
      console.log(`[db] migrated data from previous app folder "${legacy}"`)
    } catch (err) {
      // Never block startup: worst case the customer restores from a backup.
      console.error('[db] could not migrate previous app data:', err)
    }
    return
  }
}

export function getDatabasePath(): string {
  if (process.env.LEDGERLINE_DB_PATH) return process.env.LEDGERLINE_DB_PATH
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  migrateLegacyUserData(dir)
  return join(dir, 'ledgerline.db')
}

/** libSQL accepts a file: URL. Normalise Windows backslashes for the URL form. */
function fileUrl(path: string): string {
  return 'file:' + path.replace(/\\/g, '/')
}

export async function initDatabase(): Promise<DB> {
  if (db) return db
  const path = getDatabasePath()
  client = createClient({ url: fileUrl(path) })
  // Production-grade pragmas (libSQL local file = standard SQLite).
  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute('PRAGMA synchronous = NORMAL')
  await client.execute('PRAGMA busy_timeout = 5000')
  db = drizzle(client, { schema })
  return db
}

export function getDb(): DB {
  if (!db) throw new Error('Database not initialised. Call initDatabase() first.')
  return db
}

/** Raw client for migrations, backup (VACUUM INTO) and maintenance. */
export function getClient(): Client {
  if (!client) throw new Error('Database not initialised.')
  return client
}

export function closeDatabase(): void {
  client?.close()
  client = null
  db = null
}
