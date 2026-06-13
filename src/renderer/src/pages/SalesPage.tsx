import { DocumentListPage } from '@renderer/components/DocumentListPage'

export function SalesPage(): JSX.Element {
  return (
    <DocumentListPage
      title="Sales"
      subtitle="Invoices, proforma, delivery challans, orders and returns."
      mode="sales"
      createPerm="sales:create"
      deletePerm="sales:delete"
      tabs={[
        { docType: 'invoice', label: 'Invoices' },
        { docType: 'proforma', label: 'Proforma' },
        { docType: 'challan', label: 'Delivery Challan' },
        { docType: 'sales_order', label: 'Orders' },
        { docType: 'sales_return', label: 'Returns (Credit Note)' }
      ]}
    />
  )
}
