import { ZodError } from 'zod'
import { route, AppError } from './router'
import {
  getCompany,
  saveCompany,
  getSettings,
  setSettings,
  getCompanyLogoDataUrl,
  pickCompanyLogo,
  removeCompanyLogo
} from '../services/settings'
import type { CompanyInput } from '@shared/dto'

export function registerSettingsRoutes(): void {
  route<void, unknown>('settings:company:get', 'settings:view', () => getCompany())

  route<void, { dataUrl: string | null }>('settings:logo:get', 'settings:view', async () => ({
    dataUrl: await getCompanyLogoDataUrl()
  }))
  route<void, { dataUrl: string | null }>('settings:logo:pick', 'settings:manage', (_p, ctx) =>
    pickCompanyLogo(ctx.user)
  )
  route<void, { ok: true }>('settings:logo:remove', 'settings:manage', async (_p, ctx) => {
    await removeCompanyLogo(ctx.user)
    return { ok: true }
  })

  route<CompanyInput, { ok: true }>('settings:company:save', 'settings:manage', async (p, ctx) => {
    try {
      await saveCompany(p, ctx.user)
    } catch (err) {
      if (err instanceof ZodError) throw new AppError(err.errors[0]?.message ?? 'Invalid input.', 'VALIDATION')
      throw err
    }
    return { ok: true }
  })

  route<void, Record<string, unknown>>('settings:get', 'settings:view', () => getSettings())

  route<Record<string, unknown>, { ok: true }>('settings:save', 'settings:manage', async (p, ctx) => {
    await setSettings(p, ctx.user)
    return { ok: true }
  })
}
