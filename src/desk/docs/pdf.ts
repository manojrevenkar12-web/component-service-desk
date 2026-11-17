import { createHash } from 'node:crypto'
import { extractText, getDocumentProxy } from 'unpdf'

const cache = new Map<string, string>()

/** The text layer of a PDF. A photo saved as PDF has none and comes back empty. Parsed once per file content. */
export async function pdfText(base64: string): Promise<string> {
  const key = createHash('sha256').update(base64).digest('hex')
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let text = ''
  try {
    const doc = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')))
    const out = await extractText(doc, { mergePages: true })
    text = (Array.isArray(out.text) ? out.text.join('\n') : out.text).replace(/[ \t]+/g, ' ').trim()
  } catch {
    text = ''
  }
  cache.set(key, text)
  return text
}
