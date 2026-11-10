/** Trechos do formato de mensagem da API do Gmail (users.messages.get, format=full). */
export interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export interface GmailMessage {
  id: string
  internalDate?: string
  payload?: GmailPart
}

export interface ParsedMessage {
  from: string
  fromEmail: string
  fromName: string
  subject: string
  text: string
  /** Domínios dos links do e-mail (ajuda a perceber golpe). */
  linkDomains: string[]
  pdf: { attachmentId: string; filename: string; size: number } | null
}

export const MAX_TEXT_CHARS = 12_000
export const MAX_PDF_BYTES = 4_000_000

const decode = (data: string | undefined) => (data ? Buffer.from(data, 'base64url').toString('utf8') : '')

function header(part: GmailPart | undefined, name: string): string {
  const h = part?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' '
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function collect(part: GmailPart | undefined, out: { plain: string[]; html: string[]; pdfs: GmailPart[] }) {
  if (!part) return
  const mime = (part.mimeType ?? '').toLowerCase()
  if (part.parts?.length) {
    for (const p of part.parts) collect(p, out)
    return
  }
  const isPdf = mime === 'application/pdf' || (part.filename ?? '').toLowerCase().endsWith('.pdf')
  if (isPdf && part.body?.attachmentId) out.pdfs.push(part)
  else if (mime === 'text/plain' && part.body?.data) out.plain.push(decode(part.body.data))
  else if (mime === 'text/html' && part.body?.data) out.html.push(decode(part.body.data))
}

export function linkDomains(html: string): string[] {
  const domains = new Set<string>()
  for (const m of html.matchAll(/href\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)) {
    try {
      domains.add(new URL(m[1]).hostname.toLowerCase())
    } catch {
      // link malformado: ignora
    }
    if (domains.size >= 15) break
  }
  return [...domains]
}

export function splitFrom(raw: string): { email: string; name: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw)
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() }
  return { name: '', email: raw.trim().toLowerCase() }
}

export function parseGmailMessage(msg: GmailMessage): ParsedMessage {
  const from = header(msg.payload, 'From')
  const { email, name } = splitFrom(from)
  const bucket = { plain: [] as string[], html: [] as string[], pdfs: [] as GmailPart[] }
  collect(msg.payload, bucket)

  const plain = bucket.plain.join('\n').trim()
  const html = bucket.html.join('\n')
  const text = (plain.length >= 40 || !html ? plain : htmlToText(html)).slice(0, MAX_TEXT_CHARS)

  const pdfPart = bucket.pdfs.find((p) => (p.body?.size ?? 0) > 0 && (p.body?.size ?? 0) <= MAX_PDF_BYTES)
  return {
    from,
    fromEmail: email,
    fromName: name || email.split('@')[0] || '',
    subject: header(msg.payload, 'Subject'),
    text,
    linkDomains: linkDomains(html || plain),
    pdf: pdfPart
      ? { attachmentId: pdfPart.body!.attachmentId!, filename: pdfPart.filename ?? 'anexo.pdf', size: pdfPart.body?.size ?? 0 }
      : null,
  }
}
