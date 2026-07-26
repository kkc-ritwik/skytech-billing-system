import { installIpcRouter } from './router'
import { registerAuthRoutes } from './auth'
import { registerLicenseRoutes } from './license'
import { registerSystemRoutes } from './system'
import { registerItemRoutes } from './items'
import { registerPartyRoutes } from './parties'
import { registerSettingsRoutes } from './settings'
import { registerInventoryRoutes } from './inventory'
import { registerPurchaseRoutes } from './purchases'
import { registerSalesRoutes } from './sales'
import { registerPaymentRoutes } from './payments'
import { registerReportRoutes } from './reports'
import { registerDocumentRoutes } from './documents'
import { registerUserRoutes } from './users'
import { registerBarcodeRoutes } from './barcode'
import { registerAuditRoutes } from './audit'

/** Registers every IPC route, then installs the single dispatcher. */
export function registerAllRoutes(): void {
  registerAuthRoutes()
  registerLicenseRoutes()
  registerSystemRoutes()
  registerItemRoutes()
  registerPartyRoutes()
  registerSettingsRoutes()
  registerInventoryRoutes()
  registerPurchaseRoutes()
  registerSalesRoutes()
  registerPaymentRoutes()
  registerReportRoutes()
  registerDocumentRoutes()
  registerUserRoutes()
  registerBarcodeRoutes()
  registerAuditRoutes()
  installIpcRouter()
}
