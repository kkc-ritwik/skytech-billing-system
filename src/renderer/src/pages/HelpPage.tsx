import { useEffect, useState } from 'react'
import { Mail, Phone, Globe, FolderOpen, FileText, Copy, Info, LifeBuoy } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { CHANNELS } from '@shared/ipc'
import { PRODUCT_NAME, COMPANY_NAME, TAGLINE, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_WEBSITE, editionLabel } from '@shared/app-config'
import { PageHeader } from '@renderer/components/PageHeader'
import { BrandMark } from '@renderer/components/BrandMark'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

export function HelpPage(): JSX.Element {
  const license = useApp((s) => s.license)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void invoke<{ version: string }>(CHANNELS.appInfo).then((i) => setVersion(i.version)).catch(() => undefined)
  }, [])

  const phoneDigits = SUPPORT_PHONE.replace(/\s/g, '')

  async function openFolder(channel: string, label: string): Promise<void> {
    try {
      await invoke(channel)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Could not open ${label}.`)
    }
  }

  return (
    <div>
      <PageHeader title="Help & Support" subtitle="About this app, how to reach us, and where your data lives." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Info className="size-5 text-primary" /> About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <BrandMark size={40} />
              </div>
              <div>
                <div className="text-base font-bold">{PRODUCT_NAME}</div>
                <div className="text-muted-foreground">{TAGLINE}</div>
              </div>
            </div>
            <Row label="Version" value={version || '—'} />
            <Row label="Made by" value={`${COMPANY_NAME} Developments`} />
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">License</span>
              <span className="flex items-center gap-2 font-medium">
                {license?.status === 'active' ? <Badge variant="success">Licensed</Badge> : license?.status === 'trial' ? <Badge variant="warning">Trial · {license?.daysRemaining}d</Badge> : <Badge variant="secondary">{license?.status}</Badge>}
                {license?.edition ? editionLabel(license.edition) : ''}
              </span>
            </div>
            {license?.machineFingerprint && (
              <div>
                <span className="text-xs uppercase text-muted-foreground">Machine ID</span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{license.machineFingerprint}</code>
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(license.machineFingerprint); toast.success('Copied.') }}><Copy /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LifeBuoy className="size-5 text-primary" /> Contact support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Need help, a license key, or an upgrade? Reach {COMPANY_NAME}:</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 font-medium text-primary hover:underline"><Mail className="size-4" /> {SUPPORT_EMAIL}</a>
            <a href={`tel:${phoneDigits}`} className="flex items-center gap-2 font-medium text-primary hover:underline"><Phone className="size-4" /> {SUPPORT_PHONE}</a>
            <a href={`https://${SUPPORT_WEBSITE}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium text-primary hover:underline"><Globe className="size-4" /> {SUPPORT_WEBSITE}</a>
            <a
              href={`https://wa.me/${phoneDigits.replace('+', '')}?text=${encodeURIComponent(`Hi, I need help with ${PRODUCT_NAME}.`)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 font-medium text-success hover:bg-success/20"
            >
              Chat on WhatsApp
            </a>
          </CardContent>
        </Card>

        {/* Your data */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FolderOpen className="size-5 text-primary" /> Your data & files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              All your data is stored locally on this computer. Back it up regularly (Settings → Backup).
              These shortcuts help you and our support team find the right files.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void openFolder('system:openDataFolder', 'data folder')}><FolderOpen className="size-4" /> Open data &amp; backups folder</Button>
              <Button variant="outline" onClick={() => void openFolder('system:openLogs', 'logs folder')}><FileText className="size-4" /> Open logs folder</Button>
            </div>
            <p className="text-xs text-muted-foreground">Tip: the full <strong>User Guide</strong> PDF was shipped with your installer. For step-by-step help, see the demo walkthrough in it.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
