import { Mail, Phone, Sparkles } from 'lucide-react'
import { SUPPORT_EMAIL, SUPPORT_PHONE, PRODUCT_NAME } from '@shared/app-config'

/**
 * "Upgrade to Premium / contact us" panel. Shown on the trial-locked screen and
 * the License page so customers know exactly how to reach us to buy a key.
 */
export function UpgradeContact({ compact = false }: { compact?: boolean }): JSX.Element {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      {!compact && (
        <div className="mb-2 flex items-center gap-2 font-semibold text-primary">
          <Sparkles className="size-4" /> Upgrade {PRODUCT_NAME} to Premium
        </div>
      )}
      <p className="mb-3 text-sm text-muted-foreground">
        To activate a full license, share your <strong>Machine ID</strong> with us. We'll send a key
        bound to this computer.
      </p>
      <div className="flex flex-col gap-2 text-sm">
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Shailee-GRMS%20License%20Request`} className="flex items-center gap-2 font-medium text-primary hover:underline">
          <Mail className="size-4" /> {SUPPORT_EMAIL}
        </a>
        <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`} className="flex items-center gap-2 font-medium text-primary hover:underline">
          <Phone className="size-4" /> {SUPPORT_PHONE}
        </a>
      </div>
    </div>
  )
}
