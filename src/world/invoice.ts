import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type InvoiceLang = 'de' | 'en' | 'fr'

export interface InvoiceData {
  lang: InvoiceLang
  dealer: string
  number: string
  /** ISO date. */
  date: string
  customer: string
  productName: string
  sku: string
  serial: string
  priceCents: number
}

const LABELS: Record<InvoiceLang, { title: string; number: string; date: string; customer: string; item: string; sku: string; serial: string; total: string }> = {
  de: { title: 'Rechnung', number: 'Rechnungsnummer:', date: 'Rechnungsdatum:', customer: 'Kunde:', item: 'Pos. 1', sku: 'Art.-Nr.', serial: 'Seriennummer:', total: 'Gesamtbetrag:' },
  en: { title: 'Invoice', number: 'Invoice number:', date: 'Invoice date:', customer: 'Customer:', item: '1 x', sku: 'SKU', serial: 'Serial number:', total: 'Total:' },
  fr: { title: 'Facture', number: 'Numéro de facture :', date: 'Date de facture :', customer: 'Client :', item: '1 x', sku: 'Réf.', serial: 'Numéro de série :', total: 'Total TTC :' },
}

export function localDate(iso: string, lang: InvoiceLang | 'pl'): string {
  const [y, m, d] = iso.split('-')
  return lang === 'de' || lang === 'pl' ? `${d}.${m}.${y}` : `${d}/${m}/${y}`
}

function money(cents: number, lang: InvoiceLang): string {
  const s = `${Math.floor(cents / 100)}${lang === 'en' ? '.' : ','}${String(cents % 100).padStart(2, '0')}`
  return `${s} EUR`
}

/** Helvetica in a PDF only has the Windows-1252 letters; anything else is written without its accent. */
function winAnsi(s: string): string {
  const fold: Record<string, string> = { '\u0142': 'l', '\u0141': 'L', '\u0131': 'i', '\u0130': 'I' }
  return [...s].map((c) => (/[\u0000-\u00ff\u2019\u2013\u20ac]/.test(c) ? c : (fold[c] ?? c.normalize('NFD').replace(/[^\u0000-\u00ff]/g, '')))).join('')
}

export async function invoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setCreationDate(new Date(`${inv.date}T10:00:00Z`))
  doc.setModificationDate(new Date(`${inv.date}T10:00:00Z`))
  doc.setProducer('world')
  doc.setCreator('world')
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const L = LABELS[inv.lang]
  let y = 780
  const line = (text: string, f = font, size = 11) => {
    page.drawText(winAnsi(text), { x: 56, y, size, font: f, color: rgb(0.1, 0.1, 0.12) })
    y -= size + 10
  }
  line(inv.dealer, bold, 14)
  y -= 10
  line(L.title, bold, 18)
  line(`${L.number} ${inv.number}`)
  line(`${L.date} ${localDate(inv.date, inv.lang)}`)
  line(`${L.customer} ${inv.customer}`)
  y -= 14
  line(`${L.item} ${inv.productName} (${L.sku} ${inv.sku}) ${money(inv.priceCents, inv.lang)}`)
  line(`${L.serial} ${inv.serial}`)
  y -= 10
  line(`${L.total} ${money(inv.priceCents, inv.lang)}`, bold)
  return doc.save({ useObjectStreams: false })
}

/** A phone photo of a paper invoice saved as PDF: an image page with no text layer. */
export async function scannedPdf(seedDate: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setCreationDate(new Date(`${seedDate}T10:00:00Z`))
  doc.setModificationDate(new Date(`${seedDate}T10:00:00Z`))
  doc.setProducer('world')
  doc.setCreator('world')
  const page = doc.addPage([595, 842])
  for (let i = 0; i < 14; i++) page.drawRectangle({ x: 56, y: 760 - i * 34, width: 300 + ((i * 47) % 160), height: 9, color: rgb(0.55, 0.55, 0.57) })
  return doc.save({ useObjectStreams: false })
}
