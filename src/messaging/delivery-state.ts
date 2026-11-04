/** Shared delivery status calculation for host and browser. */
import type { DeliveryRecord } from './delivery.ts'
export function deliveryState(record: DeliveryRecord): 'pending' | 'sent' | 'partial' | 'failed' | 'unknown' {
  if (record.parts.every(part => part.state === 'sent')) return 'sent'
  if (record.parts.some(part => part.state === 'unknown')) return 'unknown'
  if (record.parts.some(part => part.state === 'sent')) return 'partial'
  if (record.parts.some(part => ['failed', 'unsupported'].includes(part.state))) return 'failed'
  return 'pending'
}
