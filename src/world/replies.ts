import type { Lang } from '../wire.ts'

/**
 * How the simulated drafting model words a reply from the facts the desk gives it. The desk never sees this file;
 * it only sees the text that comes back and checks it.
 */

export interface DraftFacts {
  lang: Lang
  customer: string
  resolution: { kind: string; verdict?: string; reason?: string; express?: boolean; missing?: string[]; article?: string; sku?: string }
  items?: string[]
  numbers?: { key: string; value: number; unit: string }[]
  kitSku?: string
  rmaNumber?: string
  product?: string
  purchaseDate?: string
  warrantyUntil?: string
  warrantyYears?: number
  country?: string
  options?: string[]
  article?: { title: string; summary: string; url: string }
  spare?: { sku: string; name: string }
  genA?: string
  genB?: string
  socket?: string
}

const LABEL: Record<string, Record<Lang, string>> = {
  cooler_height: { de: 'Kühlerhöhe', en: 'cooler height', fr: 'hauteur du ventirad', pl: 'wysokość chłodzenia' },
  case_max_cooler: { de: 'maximale Kühlerhöhe des Gehäuses', en: 'cooler clearance of the case', fr: 'hauteur maximale de ventirad du boîtier', pl: 'maksymalna wysokość chłodzenia w obudowie' },
  gpu_length: { de: 'Länge der Grafikkarte', en: 'card length', fr: 'longueur de la carte', pl: 'długość karty' },
  case_max_gpu: { de: 'maximale Kartenlänge des Gehäuses', en: 'card clearance of the case', fr: 'longueur maximale de carte du boîtier', pl: 'maksymalna długość karty w obudowie' },
  psu_length: { de: 'Länge des Netzteils', en: 'power supply length', fr: 'longueur de l’alimentation', pl: 'długość zasilacza' },
  case_max_psu: { de: 'maximale Netzteillänge des Gehäuses', en: 'power supply clearance of the case', fr: 'longueur maximale d’alimentation du boîtier', pl: 'maksymalna długość zasilacza w obudowie' },
  psu_watts: { de: 'Leistung des Netzteils', en: 'power supply rating', fr: 'puissance de l’alimentation', pl: 'moc zasilacza' },
  need_watts: { de: 'empfohlene Mindestleistung', en: 'recommended minimum', fr: 'puissance minimale recommandée', pl: 'zalecana minimalna moc' },
  radiator: { de: 'Radiatorgröße', en: 'radiator size', fr: 'taille du radiateur', pl: 'rozmiar chłodnicy' },
  case_radiators: { de: 'größter Radiator im Gehäuse', en: 'largest radiator the case takes', fr: 'plus grand radiateur accepté', pl: 'największa chłodnica w obudowie' },
}

const T = {
  hello: { de: 'Hallo {n},', en: 'Hello {n},', fr: 'Bonjour {n},', pl: 'Dzień dobry, {n},' },
  bye: { de: 'Viele Grüße\nIhr Stillmark Support-Team', en: 'Best regards,\nStillmark Support', fr: 'Cordialement,\nLe support Stillmark', pl: 'Pozdrawiamy,\nZespół wsparcia Stillmark' },
  thanks: { de: 'vielen Dank für Ihre Nachricht.', en: 'thank you for your message.', fr: 'merci pour votre message.', pl: 'dziękujemy za wiadomość.' },
  fits: { de: '{i} passen zusammen.', en: '{i} work together.', fr: '{i} sont compatibles.', pl: '{i} są ze sobą kompatybilne.' },
  kit: {
    de: '{i} passen zusammen, wenn Sie das kostenlose Montagekit {k} verwenden. Wir schicken es Ihnen gern zu.',
    en: '{i} work together with the free mounting kit {k}. We are happy to send it to you.',
    fr: '{i} sont compatibles avec le kit de montage gratuit {k}, que nous vous envoyons volontiers.',
    pl: '{i} są kompatybilne z bezpłatnym zestawem montażowym {k}, który chętnie wyślemy.',
  },
  nofit: { de: '{i} passen leider nicht zusammen.', en: 'Unfortunately, {i} are not compatible.', fr: 'Malheureusement, {i} ne sont pas compatibles.', pl: 'Niestety {i} nie są ze sobą kompatybilne.' },
  socket: { de: 'Der Kühler unterstützt den Sockel {s} nicht.', en: 'The cooler does not support the {s} socket.', fr: 'Le ventirad ne prend pas en charge le socket {s}.', pl: 'Chłodzenie nie obsługuje gniazda {s}.' },
  connector: {
    de: 'Die Karte braucht einen 12V-2x6-Anschluss, den nur Netzteile der Kabelgeneration C5 ohne Adapter liefern.',
    en: 'The card needs a 12V-2x6 connector, which only power supplies of cable generation C5 provide without an adapter.',
    fr: 'La carte a besoin d’un connecteur 12V-2x6, que seules les alimentations de génération de câbles C5 fournissent sans adaptateur.',
    pl: 'Karta wymaga złącza 12V-2x6, które bez adaptera mają tylko zasilacze z generacją kabli C5.',
  },
  cables: {
    de: 'Modulare Kabel der Generation {a} dürfen nicht an Netzteilen der Generation {b} verwendet werden.',
    en: 'Modular cables of generation {a} must not be used with power supplies of generation {b}.',
    fr: 'Les câbles modulaires de génération {a} ne doivent pas être utilisés avec des alimentations de génération {b}.',
    pl: 'Modularnych kabli generacji {a} nie wolno używać z zasilaczami generacji {b}.',
  },
  values: { de: 'Zum Vergleich: {v}.', en: 'For reference: {v}.', fr: 'Pour comparaison : {v}.', pl: 'Dla porównania: {v}.' },
  rma: { de: 'wir haben Ihren Austausch angelegt. Ihre Rücksendenummer lautet {r}.', en: 'we have opened your replacement. Your return number is {r}.', fr: 'nous avons ouvert votre échange. Votre numéro de retour est {r}.', pl: 'utworzyliśmy zgłoszenie wymiany. Twój numer zwrotu to {r}.' },
  express: {
    de: 'Weil Ihr {p} unter den Express-Austausch fällt, schicken wir Ihnen das Ersatzgerät vorab zu.',
    en: 'Because your {p} qualifies for express exchange, we will send the replacement first.',
    fr: 'Comme votre {p} bénéficie de l’échange express, nous vous envoyons le produit de remplacement en premier.',
    pl: 'Ponieważ Twój {p} kwalifikuje się do wymiany ekspresowej, najpierw wyślemy produkt zastępczy.',
  },
  standard: {
    de: 'Bitte schicken Sie das Gerät mit dieser Nummer an uns; nach der Prüfung erhalten Sie ein Austauschgerät.',
    en: 'Please send the unit to us with this number; after the check you will receive a replacement.',
    fr: 'Merci de nous envoyer le produit avec ce numéro ; après vérification, vous recevrez un produit de remplacement.',
    pl: 'Prosimy o odesłanie produktu z tym numerem; po sprawdzeniu otrzymasz produkt zastępczy.',
  },
  until: { de: 'Ihre Garantie läuft bis zum {u}.', en: 'Your warranty runs until {u}.', fr: 'Votre garantie court jusqu’au {u}.', pl: 'Gwarancja obowiązuje do {u}.' },
  expired: {
    de: 'leider ist die Garantie für Ihr {p} am {u} abgelaufen ({y} Jahre ab dem Kauf am {d}). Gern machen wir Ihnen ein Angebot für eine Reparatur.',
    en: 'unfortunately the warranty for your {p} ended on {u} ({y} years from the purchase on {d}). We are happy to offer you a repair.',
    fr: 'malheureusement, la garantie de votre {p} a pris fin le {u} ({y} ans après l’achat du {d}). Nous pouvons vous proposer une réparation.',
    pl: 'niestety gwarancja na {p} wygasła {u} ({y} lat od zakupu {d}). Chętnie przygotujemy ofertę naprawy.',
  },
  country: {
    de: 'für Käufe in {c} ist unser dortiger Vertriebspartner zuständig. Bitte wenden Sie sich an den Händler, bei dem Sie gekauft haben.',
    en: 'purchases in {c} are handled by our local distribution partner. Please contact the shop you bought from.',
    fr: 'les achats en {c} sont gérés par notre partenaire local. Merci de contacter le revendeur chez qui vous avez acheté.',
    pl: 'zakupy w {c} obsługuje nasz lokalny partner. Prosimy o kontakt ze sklepem, w którym dokonano zakupu.',
  },
  status: {
    de: 'Ihr Austausch läuft bereits unter der Rücksendenummer {r}. Sie bekommen eine Nachricht, sobald das Ersatzgerät unterwegs ist.',
    en: 'your replacement is already in progress under return number {r}. You will hear from us as soon as it ships.',
    fr: 'votre échange est déjà en cours sous le numéro de retour {r}. Vous serez informé dès l’expédition.',
    pl: 'Twoja wymiana jest już w toku pod numerem zwrotu {r}. Poinformujemy Cię, gdy produkt zostanie wysłany.',
  },
  askInvoice: {
    de: 'damit wir Ihren Garantiefall prüfen können, senden Sie uns bitte die Rechnung als PDF, auf der Kaufdatum und Seriennummer lesbar sind.',
    en: 'so that we can check your warranty claim, please send us the invoice as a PDF with a readable purchase date and serial number.',
    fr: 'afin de vérifier votre demande de garantie, merci de nous envoyer la facture en PDF avec la date d’achat et le numéro de série lisibles.',
    pl: 'abyśmy mogli sprawdzić reklamację, prosimy o przesłanie faktury w PDF z czytelną datą zakupu i numerem seryjnym.',
  },
  askModel: {
    de: 'damit unsere Antwort sicher stimmt: Welches Modell genau haben Sie ({o})? Sie finden es auf dem Typenschild.',
    en: 'to be sure our answer is right: which model exactly do you have ({o})? You will find it on the rating label.',
    fr: 'pour vous répondre avec certitude : quel modèle exact avez-vous ({o}) ? Il figure sur l’étiquette signalétique.',
    pl: 'abyśmy mogli odpowiedzieć na pewno: jaki dokładnie model posiadasz ({o})? Znajdziesz go na tabliczce znamionowej.',
  },
  askSerial: {
    de: 'bitte senden Sie uns die Seriennummer vom Typenschild.',
    en: 'please send us the serial number from the rating label.',
    fr: 'merci de nous envoyer le numéro de série figurant sur l’étiquette.',
    pl: 'prosimy o przesłanie numeru seryjnego z tabliczki znamionowej.',
  },
  kb: { de: 'dazu haben wir eine Anleitung: {s} Die vollständige Anleitung: {u}', en: 'we have a guide for this: {s} The full guide: {u}', fr: 'nous avons un guide à ce sujet : {s} Le guide complet : {u}', pl: 'mamy na to instrukcję: {s} Pełna instrukcja: {u}' },
  spare: {
    de: 'das Ersatzteil {n} (Art.-Nr. {s}) schicken wir Ihnen kostenlos zu. Bitte bestätigen Sie kurz Ihre Lieferadresse.',
    en: 'we will send you the spare part {n} (SKU {s}) free of charge. Please confirm your delivery address.',
    fr: 'nous vous envoyons gratuitement la pièce {n} (réf. {s}). Merci de confirmer votre adresse de livraison.',
    pl: 'wyślemy bezpłatnie część {n} (nr art. {s}). Prosimy o potwierdzenie adresu dostawy.',
  },
  invented: { de: 'Die Bearbeitung dauert in der Regel 6 Werktage.', en: 'Processing usually takes 6 working days.', fr: 'Le traitement prend en général 6 jours ouvrés.', pl: 'Realizacja trwa zwykle 6 dni roboczych.' },
} as const

function f(t: string, v: Record<string, string | number | undefined>): string {
  return t.replace(/\{(\w)\}/g, (_, k: string) => String(v[k] ?? ''))
}

function list(items: string[], lang: Lang): string {
  const and = { de: 'und', en: 'and', fr: 'et', pl: 'i' }[lang]
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}

export interface Wording {
  /** Write the reply in English whatever the customer wrote. */
  wrongLanguage?: boolean
  /** Add a sentence with a number that is in no fact. */
  inventNumber?: boolean
  /** State the opposite of the decision. */
  flip?: boolean
}

export function wordReply(facts: DraftFacts, w: Wording = {}): string {
  const L: Lang = w.wrongLanguage ? 'en' : facts.lang
  const r = facts.resolution
  const first = facts.customer.split(' ')[0]
  const items = list(facts.items ?? [], L)
  const parts: string[] = []
  const sentence = (s: string) => s[0].toUpperCase() + s.slice(1)
  switch (r.kind) {
    case 'compat': {
      const verdict = w.flip ? (r.verdict === 'does_not_fit' ? 'fits' : 'does_not_fit') : r.verdict
      parts.push(sentence(T.thanks[L]))
      if (verdict === 'fits') parts.push(f(T.fits[L], { i: items }))
      else if (verdict === 'fits_with_kit') parts.push(f(T.kit[L], { i: items, k: facts.kitSku }))
      else parts.push(f(T.nofit[L], { i: items }))
      if (verdict === 'does_not_fit' && r.reason === 'socket') parts.push(f(T.socket[L], { s: facts.socket }))
      if (verdict === 'does_not_fit' && r.reason === 'connector') parts.push(T.connector[L])
      if (verdict === 'does_not_fit' && r.reason === 'cable_generation') parts.push(f(T.cables[L], { a: facts.genA, b: facts.genB }))
      if (facts.numbers?.length) parts.push(f(T.values[L], { v: facts.numbers.map((n) => `${LABEL[n.key][L]} ${n.value} ${n.unit}`).join(', ') }))
      break
    }
    case 'rma':
      if (w.flip) parts.push(sentence(f(T.expired[L], { p: facts.product, u: facts.warrantyUntil, y: facts.warrantyYears, d: facts.purchaseDate })))
      else {
        parts.push(sentence(f(T.rma[L], { r: facts.rmaNumber })))
        parts.push(r.express ? f(T.express[L], { p: facts.product }) : T.standard[L])
        parts.push(f(T.until[L], { u: facts.warrantyUntil }))
      }
      break
    case 'deny':
      if (w.flip) parts.push(sentence(f(T.rma[L], { r: 'RMA-60' + String(facts.customer.length).padStart(5, '0') })))
      else if (r.reason === 'country') parts.push(sentence(f(T.country[L], { c: facts.country })))
      else parts.push(sentence(f(T.expired[L], { p: facts.product, u: facts.warrantyUntil, y: facts.warrantyYears, d: facts.purchaseDate })))
      break
    case 'status':
      parts.push(sentence(f(T.status[L], { r: facts.rmaNumber })))
      break
    case 'ask':
      parts.push(sentence(T.thanks[L]))
      if (r.missing?.[0] === 'invoice') parts.push(sentence(T.askInvoice[L]))
      else if (r.missing?.[0] === 'serial') parts.push(sentence(T.askSerial[L]))
      else parts.push(sentence(f(T.askModel[L], { o: (facts.options ?? []).join(' / ') })))
      break
    case 'kb':
      parts.push(sentence(T.thanks[L]))
      parts.push(sentence(f(T.kb[L], { s: facts.article?.summary, u: facts.article?.url })))
      break
    case 'spare':
      parts.push(sentence(f(T.spare[L], { n: facts.spare?.name, s: facts.spare?.sku })))
      break
  }
  if (w.inventNumber) parts.push(T.invented[L])
  return `${f(T.hello[L], { n: first })}\n\n${parts.join(' ')}\n\n${T.bye[L]}`
}
