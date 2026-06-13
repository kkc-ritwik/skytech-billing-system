import { ZodError } from 'zod'
import { AppError } from './router'
import type { IpcErrorCode } from '@shared/ipc'

/**
 * Wrap a service call so Zod validation errors and tagged service errors
 * (`{ code }`) become clean AppErrors with the right IPC error code.
 */
export async function withValidation<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError(err.errors[0]?.message ?? 'Invalid input.', 'VALIDATION')
    }
    const tagged = err as { code?: IpcErrorCode; message?: string }
    if (tagged?.code && tagged.message && ['VALIDATION', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'].includes(tagged.code)) {
      throw new AppError(tagged.message, tagged.code)
    }
    throw err
  }
}
