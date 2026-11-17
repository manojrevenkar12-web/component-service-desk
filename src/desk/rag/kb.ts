import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Lang } from '../../wire.ts'

export interface Article {
  id: string
  title: string
  summary: Record<Lang, string>
  body: string
}

export interface Hit {
  id: string
  title: string
  score: number
  lexical: number
  semantic: number
  /** First by words and first by meaning: the two retrievers agree. */
  agreed: boolean
}

export function loadArticles(dir: string): Article[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(dir, f), 'utf8')
      const [, head, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!
      const meta = Object.fromEntries(head.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]))
      return { id: f.replace(/\.md$/, ''), title: meta.title, summary: { en: meta.summary_en, de: meta.summary_de, fr: meta.summary_fr, pl: meta.summary_pl }, body: body.trim() }
    })
}

const STOP = new Set('a an the and or of to in on is it my i me with when after at for not does do be are this that from by as up its no yes so'.split(' '))

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/12v-2x6/g, '12v2x6')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t).replace(/ing$/, ''))
}

function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * A small deterministic embedder: hashed words and character trigrams, L2-normalised. It stands in for an embedding
 * model in tests and in the evaluation; the service stores the same vectors in pgvector.
 */
export function embed(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0)
  for (const t of tokens(text)) {
    v[fnv(`w:${t}`) % dims] += 1
    const padded = `^${t}$`
    for (let i = 0; i + 3 <= padded.length; i++) v[fnv(`c:${padded.slice(i, i + 3)}`) % dims] += 0.3
  }
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}

export function cosine(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Hybrid search over the help articles: BM25 on words and cosine on embeddings, fused by reciprocal rank. */
export class KnowledgeBase {
  private readonly docs: { a: Article; toks: string[]; vec: number[] }[]
  private readonly df = new Map<string, number>()
  private readonly avgLen: number

  constructor(
    readonly articles: Article[],
    private readonly cfg: { dims: number; rrfK: number },
  ) {
    this.docs = articles.map((a) => {
      const text = `${a.title}\n${a.title}\n${a.summary.en}\n${a.body}`
      return { a, toks: tokens(text), vec: embed(text, cfg.dims) }
    })
    for (const d of this.docs) for (const t of new Set(d.toks)) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    this.avgLen = this.docs.reduce((s, d) => s + d.toks.length, 0) / Math.max(1, this.docs.length)
  }

  vectors(): { id: string; vec: number[] }[] {
    return this.docs.map((d) => ({ id: d.a.id, vec: d.vec }))
  }

  private bm25(q: string[], toks: string[]): number {
    const k1 = 1.2
    const b = 0.75
    const N = this.docs.length
    let s = 0
    for (const t of new Set(q)) {
      const tf = toks.filter((x) => x === t).length
      if (!tf) continue
      const df = this.df.get(t) ?? 0
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      s += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * toks.length) / this.avgLen))
    }
    return s
  }

  search(query: string, k = 3): Hit[] {
    const q = tokens(query)
    const qv = embed(query, this.cfg.dims)
    const scored = this.docs.map((d) => ({ id: d.a.id, title: d.a.title, lexical: this.bm25(q, d.toks), semantic: cosine(qv, d.vec) }))
    const lexRank = [...scored].sort((a, b) => b.lexical - a.lexical || a.id.localeCompare(b.id)).map((s) => s.id)
    const semRank = [...scored].sort((a, b) => b.semantic - a.semantic || a.id.localeCompare(b.id)).map((s) => s.id)
    const fused = scored.map((s) => ({
      ...s,
      score: 1 / (this.cfg.rrfK + lexRank.indexOf(s.id) + 1) + 1 / (this.cfg.rrfK + semRank.indexOf(s.id) + 1),
      agreed: lexRank[0] === s.id && semRank[0] === s.id,
    }))
    return fused.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k)
  }

  article(id: string): Article | undefined {
    return this.articles.find((a) => a.id === id)
  }
}
