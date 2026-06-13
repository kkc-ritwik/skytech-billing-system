import { format } from 'date-fns'

export { formatINR, toPaise, toRupees } from '@shared/money'
export { formatQty } from '@shared/qty'

export function formatDate(value: number | Date | null | undefined): string {
  if (value == null) return '—'
  return format(typeof value === 'number' ? new Date(value) : value, 'dd MMM yyyy')
}
