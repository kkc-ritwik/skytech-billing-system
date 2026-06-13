import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, appendFileSync, statSync, renameSync, existsSync } from 'fs'

/**
 * Lightweight file logger for the main process. Captures uncaught errors and
 * unhandled rejections so production issues are diagnosable (no devtools on a
 * customer's PC). Logs live in userData/logs/main.log with simple rotation.
 */
let logPath: string | null = null

function ensurePath(): string {
  if (logPath) return logPath
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  logPath = join(dir, 'main.log')
  return logPath
}

export function log(level: 'info' | 'warn' | 'error', message: string, extra?: unknown): void {
  try {
    const p = ensurePath()
    // Rotate at ~2 MB.
    if (existsSync(p) && statSync(p).size > 2 * 1024 * 1024) {
      try {
        renameSync(p, p + '.1')
      } catch {
        /* ignore */
      }
    }
    const line = `${new Date().toISOString()} [${level}] ${message}${extra ? ' ' + safe(extra) : ''}\n`
    appendFileSync(p, line, 'utf8')
  } catch {
    /* logging must never throw */
  }
}

function safe(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function installCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    log('error', 'uncaughtException', err)
    console.error('[uncaughtException]', err)
  })
  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandledRejection', reason)
    console.error('[unhandledRejection]', reason)
  })
}
