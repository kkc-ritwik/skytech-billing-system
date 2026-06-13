import { DocumentListPage } from '@renderer/components/DocumentListPage'

export function PurchasesPage(): JSX.Element {
  return (
    <DocumentListPage
      title="Purchases"
      subtitle="Purchase orders, goods received (stock in) and returns."
      mode="purchase"
      createPerm="purchase:create"
      deletePerm="purchase:delete"
      tabs={[
        { docType: 'grn', label: 'Goods Received (GRN)' },
        { docType: 'purchase_order', label: 'Purchase Orders' },
        { docType: 'purchase_return', label: 'Returns (Debit Note)' }
      ]}
    />
  )
}
