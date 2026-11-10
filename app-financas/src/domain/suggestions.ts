import { billAppliesTo, entryId, isValidCnpj } from './bills'
import { competenceOf, diffDays, dueDateFor } from './dates'
import { CATEGORIES } from './labels'
import type { Bill, Competence, Entry, IsoDate, PaymentMethod, Recurrence, ValueType } from './types'

/* -------------------------------------------------------------------------- */
/* Parâmetros (ajustáveis)                                                    */
/* -------------------------------------------------------------------------- */

/** Pontuação mínima (0 a 100) para tratar a cobrança como "da mesma conta" sem pedir confirmação. */
export const AUTO_SCORE = 85
/** Abaixo disto a cobrança é tratada como fornecedor novo. */
export const MIN_CANDIDATE_SCORE = 30
/** Confiança mínima (0 a 1) que o modelo precisa ter para a leitura valer. */
export const MIN_MODEL_CONFIDENCE = 0.5
/** Diferença de valor aceita como "praticamente igual" na pontuação. */
export const AMOUNT_TOLERANCE = 0.05

/** Pesos do matching, em pontos de 0 a 100 (CNPJ 35, remetente 25, nome 15, valor 10, competência 10, documento 5). */
export const WEIGHTS = { cnpj: 35, sender: 25, name: 15, amount: 10, competence: 10, document: 5 } as const

/* -------------------------------------------------------------------------- */
/* Leitura do e-mail (saída do modelo)                                        */
/* -------------------------------------------------------------------------- */

export type MailKind = 'charge' | 'payment' | 'other'

/** Sinais de golpe que o modelo pode marcar. */
export const SCAM_SIGNALS = [
  'pede_pix_ou_transferencia_para_chave_nova',
  'link_ou_dominio_suspeito',
  'urgencia_ou_ameaca',
  'pede_senha_ou_dados_pessoais',
  'beneficiario_do_boleto_diferente',
  'remetente_nao_corresponde_a_empresa',
  'pede_para_ignorar_instrucoes_anteriores',
] as const

/** Sinais que o código acrescenta ao comparar com o que já está cadastrado. */
export const CODE_SIGNALS = ['remetente_diferente_do_habitual', 'cnpj_diferente_do_cadastro'] as const

export const SIGNAL_LABEL: Record<string, string> = {
  pede_pix_ou_transferencia_para_chave_nova: 'Pede PIX ou transferência para uma chave nova',
  link_ou_dominio_suspeito: 'Link ou domínio suspeito',
  urgencia_ou_ameaca: 'Urgência ou ameaça para você pagar rápido',
  pede_senha_ou_dados_pessoais: 'Pede senha ou dados pessoais',
  beneficiario_do_boleto_diferente: 'Beneficiário do boleto diferente do habitual',
  remetente_nao_corresponde_a_empresa: 'Remetente não parece ser da empresa',
  pede_para_ignorar_instrucoes_anteriores: 'Tenta dar ordens ao sistema de leitura',
  remetente_diferente_do_habitual: 'Veio de um remetente diferente do habitual desta conta',
  cnpj_diferente_do_cadastro: 'O CNPJ não é o cadastrado nesta conta',
}

export interface Extraction {
  kind: MailKind
  vendorName: string
  /** Só dígitos; vazio se ausente ou inválido. */
  cnpj: string
  amountCents: number | null
  dueDate: IsoDate | null
  competence: Competence | null
  /** Linha digitável ou código de barras, só dígitos. */
  barcode: string
  paidAt: IsoDate | null
  category: string
  /** 0 a 1. */
  confidence: number
  scamSignals: string[]
}

export interface MailMeta {
  messageId: string
  fromEmail: string
  fromName: string
  subject: string
  receivedAt: IsoDate
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function validIsoDate(v: unknown): IsoDate | null {
  if (typeof v !== 'string') return null
  const m = ISO_DATE.exec(v.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  return v.trim()
}

function validCompetence(v: unknown): Competence | null {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim()) ? v.trim() : null
}

const MAX_CENTS = 1_000_000_000 // R$ 10 milhões: acima disso é quase certamente erro de leitura

/**
 * Valida e normaliza o que o modelo devolveu. Nada aqui confia no formato: o e-mail é texto
 * não confiável e a resposta do modelo também passa por esta peneira antes de ser usada.
 */
export function parseExtraction(raw: unknown): Extraction {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const kind: MailKind = r.kind === 'charge' || r.kind === 'payment' ? r.kind : 'other'

  const cnpjDigits = typeof r.cnpj === 'string' ? r.cnpj.replace(/\D/g, '') : ''
  const cnpj = isValidCnpj(cnpjDigits) ? cnpjDigits : ''

  let amountCents: number | null = null
  if (typeof r.amount_reais === 'number' && Number.isFinite(r.amount_reais) && r.amount_reais >= 0) {
    const cents = Math.round(r.amount_reais * 100)
    if (cents <= MAX_CENTS) amountCents = cents
  }

  const barcodeDigits = typeof r.barcode === 'string' ? r.barcode.replace(/\D/g, '') : ''
  const barcode = [44, 47, 48].includes(barcodeDigits.length) ? barcodeDigits : ''

  const category = (CATEGORIES as readonly string[]).includes(r.category as string) ? (r.category as string) : 'Outros'

  const confidence =
    typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.min(Math.max(r.confidence, 0), 1) : 0

  const signals = Array.isArray(r.scam_signals)
    ? [...new Set(r.scam_signals.filter((s): s is string => (SCAM_SIGNALS as readonly string[]).includes(s as string)))]
    : []

  return {
    kind,
    vendorName: typeof r.vendor_name === 'string' ? r.vendor_name.trim().slice(0, 80) : '',
    cnpj,
    amountCents,
    dueDate: validIsoDate(r.due_date),
    competence: validCompetence(r.competence),
    barcode,
    paidAt: validIsoDate(r.paid_at),
    category,
    confidence,
    scamSignals: signals,
  }
}

/* -------------------------------------------------------------------------- */
/* Textos e remetentes                                                        */
/* -------------------------------------------------------------------------- */

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const STOP_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'ltda', 'sa', 's', 'me', 'epp', 'eireli', 'cia',
  'companhia', 'servicos', 'servico', 'comercio', 'industria', 'brasil', 'conta', 'fatura', 'boleto',
])

function tokens(s: string): Set<string> {
  return new Set(normalizeText(s).split(' ').filter((t) => t.length > 1 && !STOP_WORDS.has(t)))
}

/** Coeficiente de sobreposição entre os nomes (0 a 1): "Vivo" contra "Internet Vivo Fibra" dá 1. */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let common = 0
  for (const t of ta) if (tb.has(t)) common += 1
  return common / Math.min(ta.size, tb.size)
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br',
  'icloud.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'msn.com', 'proton.me', 'protonmail.com',
])

export function emailAddress(raw: string): string {
  const m = /<([^>]+)>/.exec(raw)
  return (m ? m[1] : raw).trim().toLowerCase()
}

/**
 * Chave do remetente para aprender e comparar: o domínio da empresa (ex.: "vivo.com.br") ou,
 * quando é um e-mail pessoal (gmail etc.), o endereço inteiro.
 */
export function senderKey(fromEmail: string): string {
  const addr = emailAddress(fromEmail)
  const at = addr.lastIndexOf('@')
  if (at < 0) return addr
  const domain = addr.slice(at + 1)
  return FREE_MAIL.has(domain) ? addr : domain
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

/** Competência a que a cobrança se refere: mês do vencimento, ou o informado, ou o do recebimento. */
export function chargeCompetence(x: Extraction, receivedAt: IsoDate): Competence {
  return x.dueDate ? competenceOf(x.dueDate) : (x.competence ?? competenceOf(receivedAt))
}

export interface MatchScore {
  bill: Bill
  score: number
  nameSim: number
  cnpjMatch: boolean
  senderMatch: boolean
}

export function scoreMatch(
  bill: Bill,
  mail: MailMeta,
  x: Extraction,
  knownBarcodes: readonly string[] = [],
): MatchScore {
  const key = senderKey(mail.fromEmail)
  const cnpjMatch = x.cnpj !== '' && bill.cnpj !== '' && x.cnpj === bill.cnpj.replace(/\D/g, '')
  const senderMatch = (bill.emailSenders ?? []).includes(key)
  const nameSim = Math.max(
    nameSimilarity(x.vendorName, bill.name),
    nameSimilarity(x.vendorName, bill.supplier),
    nameSimilarity(mail.fromName, bill.name),
    nameSimilarity(mail.fromName, bill.supplier),
  )

  let amount = 0
  if (x.amountCents !== null) {
    if (bill.valueType === 'variable' || bill.expectedAmountCents === 0) {
      amount = WEIGHTS.amount / 2
    } else {
      const gap = Math.abs(x.amountCents - bill.expectedAmountCents) / bill.expectedAmountCents
      amount = gap <= AMOUNT_TOLERANCE ? WEIGHTS.amount : gap <= 0.3 ? WEIGHTS.amount / 2 : 0
    }
  }

  const competence = chargeCompetence(x, mail.receivedAt)
  let comp = 0
  if (billAppliesTo(bill, competence)) {
    comp = WEIGHTS.competence / 2
    if (x.dueDate && Math.abs(diffDays(x.dueDate, dueDateFor(competence, bill.dueDay))) <= 5) comp = WEIGHTS.competence
  }

  const document = x.barcode !== '' && knownBarcodes.includes(x.barcode) ? WEIGHTS.document : 0

  const score = Math.round(
    (cnpjMatch ? WEIGHTS.cnpj : 0) +
      (senderMatch ? WEIGHTS.sender : 0) +
      WEIGHTS.name * nameSim +
      amount +
      comp +
      document,
  )
  return { bill, score, nameSim, cnpjMatch, senderMatch }
}

/** A melhor conta candidata, se houver alguma com indício de ser a mesma (CNPJ, remetente ou nome parecido). */
export function bestMatch(bills: Bill[], mail: MailMeta, x: Extraction): MatchScore | null {
  let best: MatchScore | null = null
  for (const bill of bills) {
    if (!bill.active) continue
    const m = scoreMatch(bill, mail, x)
    const hasEvidence = m.cnpjMatch || m.senderMatch || m.nameSim >= 0.5
    if (!hasEvidence || m.score < MIN_CANDIDATE_SCORE) continue
    if (!best || m.score > best.score) best = m
  }
  return best
}

/* -------------------------------------------------------------------------- */
/* Decisão por cenário                                                        */
/* -------------------------------------------------------------------------- */

export interface EntryPatch {
  chargedAmountCents?: number
  dueDate?: IsoDate
  barcode?: string
}

export interface NewBillDraft {
  name: string
  supplier: string
  cnpj: string
  category: string
  valueType: ValueType
  expectedAmountCents: number
  dueDay: number
  recurrence: Recurrence
  startMonth: Competence
  paymentMethod: PaymentMethod
  amountCents: number | null
  dueDate: IsoDate | null
  barcode: string
}

export type IgnoreReason =
  | 'not_charge'
  | 'payment_phase3'
  | 'low_confidence'
  | 'low_info'
  | 'ignored_sender'
  | 'already_paid'

export type Decision =
  | { kind: 'ignore'; reason: IgnoreReason }
  /** Cenário H: a mesma cobrança de novo. */
  | { kind: 'duplicate'; fingerprint: string }
  /** Cenário I. */
  | { kind: 'scam'; signals: string[]; billId: string | null; senderKey: string }
  /** Cenário A, quando o modo "só sugerir" está desligado. */
  | { kind: 'auto_apply'; apply: ApplyCharge }
  /** Cenário B (valor ou vencimento diferente), cobrança de conta parecida, ou o modo "só sugerir". */
  | { kind: 'suggest_apply'; apply: ApplyCharge; lowConfidence: boolean }
  /** Cenário C. */
  | { kind: 'suggest_new_bill'; draft: NewBillDraft; fingerprint: string }

export interface ApplyCharge {
  billId: string
  billName: string
  entryId: string
  competence: Competence
  patch: EntryPatch
  previous: { amountCents: number; dueDate: IsoDate }
  fingerprint: string
  score: number
  senderKey: string
  cnpj: string
}

export interface DecideInput {
  mail: MailMeta
  extraction: Extraction
  bills: Bill[]
  /** O lançamento da conta naquela competência, se já existir. */
  entryFor: (billId: string, competence: Competence) => Entry | null
  fingerprintSeen: (fingerprint: string) => boolean
  onlySuggest: boolean
  ignoredSenders: readonly string[]
}

export function decide(input: DecideInput): Decision {
  const { mail, extraction: x, bills } = input
  const key = senderKey(mail.fromEmail)

  if (x.kind === 'payment') return { kind: 'ignore', reason: 'payment_phase3' }
  if (x.kind !== 'charge') return { kind: 'ignore', reason: 'not_charge' }
  if (input.ignoredSenders.includes(key)) return { kind: 'ignore', reason: 'ignored_sender' }

  const competence = chargeCompetence(x, mail.receivedAt)
  const match = bestMatch(bills, mail, x)

  // Cenário I: sinais de golpe, do modelo ou do que já está cadastrado.
  const signals = [...x.scamSignals]
  if (match) {
    const strong = match.cnpjMatch || match.nameSim >= 0.8
    const known = match.bill.emailSenders ?? []
    if (strong && known.length > 0 && !match.senderMatch) signals.push('remetente_diferente_do_habitual')
    if (match.bill.cnpj !== '' && x.cnpj !== '' && x.cnpj !== match.bill.cnpj.replace(/\D/g, '') && match.nameSim >= 0.8) {
      signals.push('cnpj_diferente_do_cadastro')
    }
  }
  if (signals.length > 0) {
    return { kind: 'scam', signals: [...new Set(signals)], billId: match?.bill.id ?? null, senderKey: key }
  }

  if (x.confidence < MIN_MODEL_CONFIDENCE) return { kind: 'ignore', reason: 'low_confidence' }

  if (match) {
    const { bill } = match
    const entry = input.entryFor(bill.id, competence)
    if (entry?.paidAt) return { kind: 'ignore', reason: 'already_paid' }

    const reference = entry ? (entry.chargedAmountCents ?? entry.expectedAmountCents) : bill.expectedAmountCents
    const currentDue = entry?.dueDate ?? dueDateFor(competence, bill.dueDay)

    const patch: EntryPatch = {}
    if (x.amountCents !== null && x.amountCents !== reference) patch.chargedAmountCents = x.amountCents
    if (x.dueDate && x.dueDate !== currentDue && competenceOf(x.dueDate) === competence) patch.dueDate = x.dueDate
    const changed = Object.keys(patch).length > 0

    // Informações novas que não mudam valor nem vencimento (cobrança confirmada, código de pagamento).
    const extra: EntryPatch = {}
    if (x.barcode !== '' && x.barcode !== (entry?.barcode ?? '')) extra.barcode = x.barcode
    if (!changed && x.amountCents !== null && entry && entry.chargedAmountCents === null) {
      extra.chargedAmountCents = x.amountCents
    }

    // Impressão digital da cobrança: o mesmo e-mail reenviado (ou um lembrete) cai no mesmo valor.
    const fingerprint = ['bill', bill.id, competence, x.amountCents ?? '', x.dueDate ?? '', x.barcode].join('|')

    const apply: ApplyCharge = {
      billId: bill.id,
      billName: bill.name,
      entryId: entryId(bill.id, competence),
      competence,
      patch: { ...patch, ...extra },
      previous: { amountCents: reference, dueDate: currentDue },
      fingerprint,
      score: match.score,
      senderKey: key,
      cnpj: x.cnpj,
    }

    if (Object.keys(apply.patch).length === 0 || input.fingerprintSeen(fingerprint)) {
      return { kind: 'duplicate', fingerprint }
    }
    if (match.score >= AUTO_SCORE && !changed && !input.onlySuggest && entry) {
      return { kind: 'auto_apply', apply }
    }
    return { kind: 'suggest_apply', apply, lowConfidence: match.score < AUTO_SCORE }
  }

  // Cenário C: fornecedor novo.
  const name = x.vendorName || mail.fromName
  if (name === '' || (x.amountCents === null && x.dueDate === null)) return { kind: 'ignore', reason: 'low_info' }
  const fingerprint = ['new', key, normalizeText(name), competence, x.amountCents ?? ''].join('|')
  if (input.fingerprintSeen(fingerprint)) return { kind: 'duplicate', fingerprint }

  return {
    kind: 'suggest_new_bill',
    fingerprint,
    draft: {
      name,
      supplier: x.vendorName || mail.fromName,
      cnpj: x.cnpj,
      category: x.category,
      valueType: x.amountCents === null ? 'variable' : 'fixed',
      expectedAmountCents: x.amountCents ?? 0,
      dueDay: x.dueDate ? Number(x.dueDate.slice(8, 10)) : 1,
      recurrence: 'monthly',
      startMonth: competence,
      paymentMethod: 'boleto',
      amountCents: x.amountCents,
      dueDate: x.dueDate,
      barcode: x.barcode,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Registro gravado no Firestore (compartilhado entre servidor e telas)       */
/* -------------------------------------------------------------------------- */

export type SuggestionType = 'new_bill' | 'apply_charge' | 'scam_alert'
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed'

export interface Suggestion {
  id: string
  type: SuggestionType
  status: SuggestionStatus
  /** Instante de criação (ISO 8601). */
  createdAt: string
  from: string
  subject: string
  receivedAt: IsoDate
  senderKey: string
  cnpj: string
  // apply_charge
  billId?: string
  billName?: string
  entryId?: string
  competence?: Competence
  patch?: EntryPatch
  previous?: { amountCents: number; dueDate: IsoDate }
  lowConfidence?: boolean
  // new_bill
  draft?: NewBillDraft
  // scam_alert
  signals?: string[]
}

/** O que o app mostra no histórico de leituras (auditoria). */
export type MailOutcome =
  | 'auto_applied'
  | 'suggested'
  | 'scam_blocked'
  | 'duplicate'
  | 'payment_pending_phase3'
  | 'ignored'

export interface MailRecord {
  id: string
  from: string
  subject: string
  receivedAt: IsoDate
  processedAt: string
  outcome: MailOutcome
  detail: string
  fingerprint: string
}
