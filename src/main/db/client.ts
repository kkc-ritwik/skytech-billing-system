import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type DB = LibSQLDatabase<typeof schema>
/** A transaction handle, structurally usable anywhere a DB is expected. */
export type Txn = Parameters<Parameters<DB['transaction']>[0]>[0]
export type DbOrTx = DB | Txn

let client: Client | null = null
let db: DB | null = null

export function getDatabasePath(): string {
  if (process.env.LEDGERLINE_DB_PATH) return process.env.LEDGERLINE_DB_PATH
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
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
