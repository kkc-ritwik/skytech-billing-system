import { useApp } from '@renderer/store/app'
import { RecoveryCodeCard } from '@renderer/components/RecoveryCodeCard'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

/** Full-screen gate shown once after account creation / password recovery. */
export function RecoveryCodeScreen({ code }: { code: string }): JSX.Element {
  const clear = useApp((s) => s.clearRecoveryCode)
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Account secured 🎉</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RecoveryCodeCard code={code} />
          <Button className="w-full" onClick={clear}>
            I've saved it — continue
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
