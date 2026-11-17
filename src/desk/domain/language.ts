import type { Lang } from '../../wire.ts'

const STOP: Record<Lang, string[]> = {
  de: ['und', 'der', 'die', 'das', 'ist', 'nicht', 'ich', 'sie', 'wir', 'mit', 'für', 'ihr', 'ihre', 'zu', 'den', 'dem', 'ein', 'eine', 'bitte', 'uns', 'auf', 'sich', 'es', 'von', 'mein', 'meine', 'habe', 'passt'],
  en: ['the', 'and', 'is', 'to', 'you', 'your', 'we', 'of', 'for', 'with', 'it', 'please', 'not', 'this', 'my', 'are', 'our', 'will', 'can', 'have', 'does'],
  fr: ['le', 'la', 'les', 'et', 'est', 'vous', 'nous', 'de', 'des', 'pour', 'avec', 'votre', 'ne', 'pas', 'une', 'un', 'du', 'merci', 'je', 'mon', 'ma', 'sont'],
  pl: ['i', 'nie', 'jest', 'się', 'na', 'do', 'z', 'w', 'to', 'czy', 'mój', 'moja', 'moje', 'prosimy', 'oraz', 'że', 'jak', 'dla', 'nas', 'mam', 'są', 'mojego'],
}

/** The language a text is written in, by counting the commonest small words. Ties go to English. */
export function detectLanguage(text: string): Lang {
  const words = text.toLowerCase().split(/[^\p{L}]+/u)
  let best: Lang = 'en'
  let top = 0
  for (const lang of ['en', 'de', 'fr', 'pl'] as Lang[]) {
    const set = new Set(STOP[lang])
    const n = words.filter((w) => set.has(w)).length
    if (n > top) {
      best = lang
      top = n
    }
  }
  return best
}
