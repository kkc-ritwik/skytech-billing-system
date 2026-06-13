import { Construction } from 'lucide-react'
import { Card, CardContent } from '@renderer/components/ui/card'

export function Placeholder({ title }: { title: string }): JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
          <Construction className="size-10 text-primary/60" />
          <p className="text-lg font-medium text-foreground">This module is being built</p>
          <p className="max-w-md text-sm">
            The data model and secure backend for this area are already in place. The screen is next
            in the build queue.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
