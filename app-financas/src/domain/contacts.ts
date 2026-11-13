import { formatPhone } from './receivables'

/**
 * Contato vindo de um arquivo .vcf exportado pelo app Contatos do celular (Android: Compartilhar > Arquivo vCard;
 * iPhone: Compartilhar contato > Salvar em Arquivos). O app só lê o arquivo que a pessoa escolheu.
 */
export interface ContactData {
  name: string
  phone: string
  email: string
}


/* ---------- Arquivo .vcf (vCard) ---------- */

function decodeQuotedPrintable(text: string, charset: string): string {
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const hex = text.slice(i + 1, i + 3)
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(text.charCodeAt(i) & 0xff)
    }
  }
  const data = new Uint8Array(bytes)
  try {
    return new TextDecoder(charset).decode(data)
  } catch {
    return new TextDecoder('utf-8').decode(data)
  }
}

const unescapeVCard = (v: string) => v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c))

/** Junta linhas quebradas (espaço no começo da seguinte) e as continuações do quoted-printable (linha terminada em "="). */
function unfold(text: string): string[] {
  const out: string[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const prev = out[out.length - 1]
    if (prev !== undefined && /^[ \t]/.test(line)) out[out.length - 1] = prev + line.slice(1)
    else if (prev !== undefined && /QUOTED-PRINTABLE/i.test(prev) && prev.endsWith('=')) out[out.length - 1] = prev.slice(0, -1) + line
    else out.push(line)
  }
  return out
}

interface Field {
  prop: string
  params: string[]
  value: string
}

function readField(line: string): Field | null {
  const colon = line.indexOf(':')
  if (colon < 1) return null
  const head = line.slice(0, colon).replace(/^[^;:]*\./, '') // tira o grupo da Apple: "item1.TEL"
  const [prop, ...params] = head.split(';').map((p) => p.trim().toUpperCase())
  let value = line.slice(colon + 1)
  if (params.some((p) => p.includes('QUOTED-PRINTABLE'))) {
    const charset = params.find((p) => p.startsWith('CHARSET='))?.slice(8) ?? 'utf-8'
    value = decodeQuotedPrintable(value, charset)
  }
  return { prop, params, value: value.trim() }
}

function nameFromN(value: string): string {
  const [family = '', given = '', middle = ''] = value.split(';')
  return [given, middle, family]
    .map((p) => unescapeVCard(p).trim())
    .filter(Boolean)
    .join(' ')
}

/** Lê os contatos de um arquivo .vcf (um ou vários). Cada contato traz nome, um telefone (de preferência o celular) e um e-mail. */
export function parseVCards(text: string): ContactData[] {
  const contacts: ContactData[] = []
  let current: { fn: string; n: string; tels: Field[]; email: string } | null = null
  for (const line of unfold(text)) {
    const field = readField(line)
    if (!field) continue
    if (field.prop === 'BEGIN' && field.value.toUpperCase() === 'VCARD') {
      current = { fn: '', n: '', tels: [], email: '' }
    } else if (field.prop === 'END' && field.value.toUpperCase() === 'VCARD') {
      if (current) {
        const mobile = current.tels.find((t) => t.params.some((p) => /CELL|MOBILE/.test(p))) ?? current.tels[0]
        const phone = mobile ? mobile.value.replace(/^tel:/i, '').trim() : ''
        const contact = { name: current.fn || nameFromN(current.n), phone: phone ? formatPhone(phone) : '', email: current.email }
        if (contact.name || contact.phone || contact.email) contacts.push(contact)
      }
      current = null
    } else if (current) {
      if (field.prop === 'FN' && !current.fn) current.fn = unescapeVCard(field.value).trim()
      else if (field.prop === 'N' && !current.n) current.n = field.value
      else if (field.prop === 'TEL') current.tels.push(field)
      else if (field.prop === 'EMAIL' && !current.email) current.email = unescapeVCard(field.value).trim()
    }
  }
  return contacts
}

