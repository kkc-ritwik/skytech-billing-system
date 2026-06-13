import { dialog, shell } from 'electron'
import { writeFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { format } from 'date-fns'
import { getDb } from '../db/client'
import { parties } from '../db/schema'
import { toRupees } from '@shared/money'
import { getCompany } from './settings'
import { getSalesDoc } from './sales'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'

const r2 = (paise: number): number => Math.round(toRupees(paise) * 100) / 100

function require_(cond: unknown, msg: string): void {
  if (!cond) throw Object.assign(new Error(msg), { code: 'VALIDATION' })
}

async function gather(id: string): Promise<{ doc: any; company: any; party: any }> {
  const doc: any = await getSalesDoc(id)
  require_(doc, 'Invoice not found.')
  require_(doc.docType === 'invoice', 'e-Invoice / e-Way is only for tax invoices.')
  const company = await getCompany()
  const party = await getDb().select().from(parties).where(eq(parties.id, doc.partyId)).get()
  require_(company?.gstin, 'Your company GSTIN is required (set it in Settings) for e-Invoice.')
  require_(party?.gstin, 'The customer GSTIN is required for a B2B e-Invoice.')
  require_(company?.stateCode, 'Your company GST state code is required (Settings).')
  require_(party?.billingStateCode, "The customer's GST state code is required.")
  return { doc, company, party }
}

/** Government e-Invoice JSON (NIC schema v1.1). Upload to the IRP/GSP to get the IRN. */
export async function exportEInvoiceJson(id: string, user: AuthUser): Promise<{ path: string }> {
  const { doc, company, party } = await gather(id)

  const items = doc.lines.map((l: any, i: number) => {
    const rate = l.taxRateBps / 100
    return {
      SlNo: String(i + 1),
      PrdDesc: l.description,
      IsServc: 'N',
      HsnCd: l.hsnCode || '',
      Qty: l.quantity,
      Unit: 'NOS',
      UnitPrice: r2(l.unitPrice),
      TotAmt: r2(l.unitPrice * l.quantity),
      Discount: r2(l.discountAmount),
      AssAmt: r2(l.taxableValue),
      GstRt: rate,
      IgstAmt: r2(l.igstAmount),
      CgstAmt: r2(l.cgstAmount),
      SgstAmt: r2(l.sgstAmount),
      CesRt: 0,
      CesAmt: 0,
      TotItemVal: r2(l.lineTotal)
    }
  })

  const payload = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: doc.number, Dt: format(new Date(doc.issueDate), 'dd/MM/yyyy') },
    SellerDtls: {
      Gstin: company.gstin,
      LglNm: company.legalName,
      TrdNm: company.tradeName || company.legalName,
      Addr1: company.addressLine1 || 'NA',
      Loc: company.city || 'NA',
      Pin: Number(company.pincode) || 0,
      Stcd: company.stateCode,
      Ph: company.phone || undefined,
      Em: company.email || undefined
    },
    BuyerDtls: {
      Gstin: party.gstin,
      LglNm: party.name,
      Pos: party.billingStateCode,
      Addr1: party.billingAddressLine1 || 'NA',
      Loc: party.billingCity || 'NA',
      Pin: Number(party.billingPincode) || 0,
      Stcd: party.billingStateCode
    },
    ItemList: items,
    ValDtls: {
      AssVal: r2(doc.subTotal),
      CgstVal: r2(doc.cgstTotal),
      SgstVal: r2(doc.sgstTotal),
      IgstVal: r2(doc.igstTotal),
      OthChrg: r2(doc.extraCharges ?? 0),
      Discount: r2(doc.extraDiscount ?? 0),
      RndOffAmt: r2(doc.roundOff),
      TotInvVal: r2(doc.grandTotal)
    }
  }

  return saveJson(payload, `e-invoice-${doc.number}`, 'e-Invoice JSON', user, 'einvoice.export', id)
}

/** Basic e-Way bill JSON. Transport fields are left blank to complete on the portal. */
export async function exportEwayJson(id: string, user: AuthUser): Promise<{ path: string }> {
  const { doc, company, party } = await gather(id)
  require_(company.pincode, 'Your company pincode is required for an e-Way bill.')
  require_(party.billingPincode, "The customer's pincode is required for an e-Way bill.")

  const itemList = doc.lines.map((l: any) => ({
    productName: l.description,
    hsnCode: l.hsnCode || '',
    quantity: l.quantity,
    qtyUnit: 'NOS',
    taxableAmount: r2(l.taxableValue),
    sgstRate: doc.isInterState ? 0 : l.taxRateBps / 200,
    cgstRate: doc.isInterState ? 0 : l.taxRateBps / 200,
    igstRate: doc.isInterState ? l.taxRateBps / 100 : 0,
    cessRate: 0
  }))

  const payload = {
    version: '1.0.0621',
    billLists: [
      {
        supplyType: 'O',
        subSupplyType: '1', // Supply
        docType: 'INV',
        docNo: doc.number,
        docDate: format(new Date(doc.issueDate), 'dd/MM/yyyy'),
        fromGstin: company.gstin,
        fromTrdName: company.tradeName || company.legalName,
        fromAddr1: company.addressLine1 || 'NA',
        fromPlace: company.city || 'NA',
        fromPincode: Number(company.pincode) || 0,
        fromStateCode: Number(company.stateCode) || 0,
        toGstin: party.gstin,
        toTrdName: party.name,
        toAddr1: party.billingAddressLine1 || 'NA',
        toPlace: party.billingCity || 'NA',
        toPincode: Number(party.billingPincode) || 0,
        toStateCode: Number(party.billingStateCode) || 0,
        totalValue: r2(doc.subTotal),
        cgstValue: r2(doc.cgstTotal),
        sgstValue: r2(doc.sgstTotal),
        igstValue: r2(doc.igstTotal),
        cessValue: 0,
        totInvValue: r2(doc.grandTotal),
        transporterId: '',
        transporterName: '',
        transMode: '1', // Road
        transDistance: '0',
        vehicleNo: '',
        vehicleType: 'R',
        itemList
      }
    ]
  }

  return saveJson(payload, `eway-${doc.number}`, 'e-Way bill JSON', user, 'eway.export', id)
}

async function saveJson(payload: object, baseName: string, title: string, user: AuthUser, action: string, id: string): Promise<{ path: string }> {
  const safe = baseName.replace(/[\\/:*?"<>|]/g, '-')
  const res = await dialog.showSaveDialog({ title: `Save ${title}`, defaultPath: `${safe}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (res.canceled || !res.filePath) throw Object.assign(new Error('Export cancelled.'), { code: 'VALIDATION' })
  writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8')
  await audit({ userId: user.id, username: user.username, action, entityType: 'sales', entityId: id })
  void shell.openPath(res.filePath)
  return { path: res.filePath }
}
