import { useEffect, useState } from 'react'
import { Loader2, FileDown } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { formatINR, formatDate } from '@renderer/lib/format'
import { Dialog } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface LedgerEntry { date: number; type: string; number: string; debit: number; credit: number; balance: number }
interface Ledger {
  party: { id: string; name: string; gstin: string | null }
  openingBalance: number
  entries: LedgerEntry[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
}

function bal(p: number): string {
  if (p === 0) return '₹0.00'
  return `${formatINR(Math.abs(p))} ${p > 0 ? 'Dr' : 'Cr'}`
}

export function PartyLedgerDialog({ partyId, onClose }: { partyId: string; onClose: () => void }): JSX.Element {
  const [data, setData] = useState<Ledger | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setData(await invoke<Ledger>('parties:ledger', { id: partyId }))
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to load ledger.')
      } finally {
        setLoading(false)
      }
    })()
  }, [partyId])

  async function exportPdf(): Promise<void> {
    setExporting(true)
    try {
      await invoke('parties:statementPdf', { id: partyId })
      toast.success('Statement saved.')
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'VALIDATION')) toast.error(err instanceof ApiError ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={data ? `Statement — ${data.party.name}` : 'Statement'}
      className="max-w-3xl"
      footer={
        <>
          <div className="mr-auto text-sm">
            Closing balance:{' '}
            <span className={`font-bold ${data && data.closingBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
              {data ? bal(data.closingBalance) : '—'}
            </span>
          </div>
          <Button variant="outline" onClick={() => void exportPdf()} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <FileDown />} Download PDF
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="animate-spin" /> Loading…</div>
      ) : !data ? (
        <p className="py-10 text-center text-muted-foreground">No data.</p>
      ) : (
        <Table>
          <THead>
            <TR><TH>Date</TH><TH>Particulars</TH><TH>Document</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH></TR>
          </THead>
          <TBody>
            <TR>
              <TD colSpan={5} className="font-medium">Opening balance</TD>
              <TD className="text-right font-medium">{bal(data.openingBalance)}</TD>
            </TR>
            {data.entries.map((e, i) => (
              <TR key={i}>
                <TD>{formatDate(e.date)}</TD>
                <TD>{e.type}</TD>
                <TD className="font-mono text-xs">{e.number}</TD>
                <TD className="text-right">{e.debit ? formatINR(e.debit) : '—'}</TD>
                <TD className="text-right">{e.credit ? formatINR(e.credit) : '—'}</TD>
                <TD className="text-right">{bal(e.balance)}</TD>
              </TR>
            ))}
            <TR>
              <TD colSpan={3} className="font-semibold">Totals</TD>
              <TD className="text-right font-semibold">{formatINR(data.totalDebit)}</TD>
              <TD className="text-right font-semibold">{formatINR(data.totalCredit)}</TD>
              <TD className="text-right font-bold">{bal(data.closingBalance)}</TD>
            </TR>
          </TBody>
        </Table>
      )}
    </Dialog>
  )
}
