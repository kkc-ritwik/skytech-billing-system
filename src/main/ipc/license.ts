import { CHANNELS, type LicenseStatus } from '@shared/ipc'
import { anonRoute, route, AppError } from './router'
import { activate, deactivate, getStatus, LicenseError } from '../services/license'
import { getMachineFingerprint } from '../services/machine'

export function registerLicenseRoutes(): void {
  route<void, { status: LicenseStatus; confirmationCode: string }>(
    CHANNELS.licenseDeactivate,
    'license:activate',
    () => deactivate()
  )

  anonRoute<void, LicenseStatus>(CHANNELS.licenseStatus, () => getStatus(), {
    bypassLicense: true
  })

  anonRoute<void, { machineId: string }>(
    CHANNELS.licenseMachineId,
    () => ({ machineId: getMachineFingerprint() }),
    { bypassLicense: true }
  )

  anonRoute<{ key: string }, LicenseStatus>(
    CHANNELS.licenseActivate,
    async (p) => {
      try {
        return await activate(p.key)
      } catch (err) {
        if (err instanceof LicenseError) throw new AppError(err.message, 'VALIDATION')
        throw err
      }
    },
    { bypassLicense: true }
  )
}
