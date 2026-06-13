import { route } from './router'
import { withValidation } from './_validate'
import { recordPayment, listPayments, openDocumentsFor } from '../services/payments'
import type { PaymentInput } from '@shared/dto'

export function registerPaymentRoutes(): void {
  route<{ direction: 'inbound' | 'outbound' }, unknown>('payments:list', 'payments:view', (p) =>
    listPayments(p.direction)
  )
  route<{ direction: 'inbound' | 'outbound'; partyId: string }, unknown>(
    'payments:openDocs',
    'payments:view',
    (p) => openDocumentsFor(p.direction, p.partyId)
  )
  route<PaymentInput, { id: string; number: string }>('payments:record', 'payments:create', (p, ctx) =>
    withValidation(() => recordPayment(p, ctx.user))
  )
}
