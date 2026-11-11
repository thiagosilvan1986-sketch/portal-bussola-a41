import { addMonths, competenceOf, diffDays, dueDateFor, formatDateBR } from './dates'
import { DUE_SOON_DAYS } from './entries'
import { formatBRL } from './money'
import type { DisplayStatus, Installment, IsoDate, Person, Receivable } from './types'

export const MAX_INSTALLMENTS = 60

/**
 * Divide o total em parcelas. A sobra de centavos vai de 1 em 1 para as primeiras parcelas,
 * então a soma é sempre igual ao total. Vencimentos mensais no mesmo dia (dia 31 vira o último dia do mês).
 */
export function buildInstallments(totalCents: number, count: number, firstDueDate: IsoDate): Installment[] {
  const base = Math.floor(totalCents / count)
  const extra = totalCents - base * count
  const day = Number(firstDueDate.slice(8, 10))
  const firstMonth = competenceOf(firstDueDate)
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    dueDate: i === 0 ? firstDueDate : dueDateFor(addMonths(firstMonth, i), day),
    amountCents: base + (i < extra ? 1 : 0),
    paidAt: null,
    paidAmountCents: null,
  }))
}

/** Marca as primeiras `k` parcelas como já recebidas (para cadastrar compra que já está em andamento). */
export function withFirstReceived(installments: Installment[], k: number, today: IsoDate): Installment[] {
  return installments.map((i) =>
    i.number <= k
      ? { ...i, paidAt: i.dueDate < today ? i.dueDate : today, paidAmountCents: i.amountCents }
      : i,
  )
}

export function installmentRemaining(i: Installment): number {
  if (i.paidAt === null) return i.amountCents
  return Math.max(i.amountCents - (i.paidAmountCents ?? 0), 0)
}

export function isSettled(i: Installment): boolean {
  return i.paidAt !== null && installmentRemaining(i) === 0
}

export function installmentStatus(i: Installment, today: IsoDate): DisplayStatus {
  if (isSettled(i)) return 'paga'
  if (i.paidAt !== null) return 'parcial'
  return dueStatus(i, today)
}

function dueStatus(i: Installment, today: IsoDate): DisplayStatus {
  const days = diffDays(today, i.dueDate)
  if (days < 0) return 'atrasada'
  if (days <= DUE_SOON_DAYS) return 'vence_em_breve'
  return 'prevista'
}

/** Registra (ou desfaz, com `null`) o recebimento de uma parcela. */
export function withPayment(
  installments: Installment[],
  number: number,
  payment: { paidAt: IsoDate; paidAmountCents: number } | null,
): Installment[] {
  return installments.map((i) =>
    i.number === number
      ? { ...i, paidAt: payment?.paidAt ?? null, paidAmountCents: payment?.paidAmountCents ?? null }
      : i,
  )
}

export interface ReceivableSummary {
  count: number
  settledCount: number
  receivedCents: number
  remainingCents: number
  overdueCount: number
  overdueCents: number
  nextDueDate: IsoDate | null
}

export function summarizeReceivable(r: Receivable, today: IsoDate): ReceivableSummary {
  const s: ReceivableSummary = {
    count: r.installments.length,
    settledCount: 0,
    receivedCents: 0,
    remainingCents: 0,
    overdueCount: 0,
    overdueCents: 0,
    nextDueDate: null,
  }
  for (const i of r.installments) {
    s.receivedCents += i.paidAt !== null ? (i.paidAmountCents ?? 0) : 0
    if (isSettled(i)) {
      s.settledCount += 1
      continue
    }
    const rest = installmentRemaining(i)
    s.remainingCents += rest
    if (i.dueDate < today) {
      s.overdueCount += 1
      s.overdueCents += rest
    }
    if (s.nextDueDate === null || i.dueDate < s.nextDueDate) s.nextDueDate = i.dueDate
  }
  return s
}

export interface PersonSummary {
  remainingCents: number
  receivedCents: number
  overdueCount: number
  overdueCents: number
  nextDueDate: IsoDate | null
  purchaseCount: number
}

export function summarizePerson(receivables: Receivable[], today: IsoDate): PersonSummary {
  const out: PersonSummary = {
    remainingCents: 0,
    receivedCents: 0,
    overdueCount: 0,
    overdueCents: 0,
    nextDueDate: null,
    purchaseCount: receivables.length,
  }
  for (const r of receivables) {
    const s = summarizeReceivable(r, today)
    out.remainingCents += s.remainingCents
    out.receivedCents += s.receivedCents
    out.overdueCount += s.overdueCount
    out.overdueCents += s.overdueCents
    if (s.nextDueDate !== null && (out.nextDueDate === null || s.nextDueDate < out.nextDueDate)) {
      out.nextDueDate = s.nextDueDate
    }
  }
  return out
}

/* ---------- Contato ---------- */

export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Número sem o 55 do Brasil, se vier com ele. */
function nationalPhone(raw: string): string {
  const d = phoneDigits(raw)
  return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d
}

/** DDD + número (10 ou 11 dígitos), com ou sem +55. Vazio é permitido (campo opcional). */
export function isValidPhone(raw: string): boolean {
  if (raw.trim() === '') return true
  const n = nationalPhone(raw)
  return n.length === 10 || n.length === 11
}

export function isValidEmail(raw: string): boolean {
  return raw.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

/** "11987654321" -> "(11) 98765-4321". Se não der para formatar, devolve como está. */
export function formatPhone(raw: string): string {
  const n = nationalPhone(raw)
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return raw.trim()
}

/** Número no formato do WhatsApp (55 + DDD + número) ou null se o telefone não serve. */
export function whatsappNumber(raw: string): string | null {
  if (raw.trim() === '' || !isValidPhone(raw)) return null
  return `55${nationalPhone(raw)}`
}

export function whatsappUrl(phone: string, message: string): string | null {
  const n = whatsappNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null
}

export function mailtoUrl(email: string, subject: string, body: string): string | null {
  const e = email.trim()
  if (e === '' || !isValidEmail(e)) return null
  return `mailto:${e}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/* ---------- Mensagem de cobrança ---------- */

export interface ChargeItem {
  receivable: Receivable
  installments: Installment[]
}

export interface ChargeMessage {
  kind: 'overdue' | 'reminder'
  subject: string
  text: string
  totalCents: number
}

function joinNumbers(nums: number[]): string {
  if (nums.length === 1) return String(nums[0])
  return `${nums.slice(0, -1).join(', ')} e ${nums[nums.length - 1]}`
}

function sumRemaining(installments: Installment[]): number {
  return installments.reduce((acc, i) => acc + installmentRemaining(i), 0)
}

/** Parcelas vencidas e não quitadas, agrupadas por compra (mais antigas primeiro). */
export function overdueItems(receivables: Receivable[], today: IsoDate): ChargeItem[] {
  return receivables
    .map((receivable) => ({
      receivable,
      installments: receivable.installments.filter((i) => !isSettled(i) && i.dueDate < today),
    }))
    .filter((it) => it.installments.length > 0)
}

/** A próxima parcela não quitada de cada compra. */
export function nextItems(receivables: Receivable[]): ChargeItem[] {
  return receivables
    .map((receivable) => ({
      receivable,
      installments: receivable.installments.filter((i) => !isSettled(i)).slice(0, 1),
    }))
    .filter((it) => it.installments.length > 0)
}

function firstName(person: Person): string {
  return person.name.trim().split(/\s+/)[0] || person.name
}

/**
 * Texto para cobrar. Se há parcela vencida, diz que não localizou o pagamento (parcela X de Y, valor).
 * Sem atraso, vira um lembrete da próxima parcela. Sem nada a receber, devolve null.
 */
export function chargeMessage(person: Person, receivables: Receivable[], today: IsoDate): ChargeMessage | null {
  const hello = `Oi, ${firstName(person)}! Tudo bem?`
  const overdue = overdueItems(receivables, today)

  if (overdue.length > 0) {
    const total = overdue.reduce((acc, it) => acc + sumRemaining(it.installments), 0)
    const ask = 'Pode me confirmar se já foi pago ou quando consegue pagar? Obrigado!'

    if (overdue.length === 1) {
      const { receivable: r, installments } = overdue[0]
      const nums = installments.map((i) => i.number)
      const oldest = installments[0].dueDate
      const subject = `Parcela em atraso: ${r.description}`
      if (installments.length === 1) {
        return {
          kind: 'overdue',
          subject,
          totalCents: total,
          text: `${hello} Não localizei o pagamento da parcela ${nums[0]} de ${r.installmentCount} (${r.description}), no valor de ${formatBRL(total)}, que venceu em ${formatDateBR(oldest)}. ${ask}`,
        }
      }
      return {
        kind: 'overdue',
        subject: `Parcelas em atraso: ${r.description}`,
        totalCents: total,
        text: `${hello} Não localizei o pagamento das parcelas ${joinNumbers(nums)} de ${r.installmentCount} (${r.description}), que somam ${formatBRL(total)} (a mais antiga venceu em ${formatDateBR(oldest)}). ${ask}`,
      }
    }

    const lines = overdue.map(({ receivable: r, installments }) => {
      const nums = installments.map((i) => i.number)
      const sum = formatBRL(sumRemaining(installments))
      const label = installments.length === 1 ? `parcela ${nums[0]}` : `parcelas ${joinNumbers(nums)}`
      const when =
        installments.length === 1
          ? `venceu em ${formatDateBR(installments[0].dueDate)}`
          : `a mais antiga venceu em ${formatDateBR(installments[0].dueDate)}`
      return `• ${r.description}: ${label} de ${r.installmentCount}, ${sum} (${when})`
    })
    return {
      kind: 'overdue',
      subject: 'Parcelas em atraso',
      totalCents: total,
      text: `${hello} Não localizei o pagamento destas parcelas:\n${lines.join('\n')}\nTotal: ${formatBRL(total)}. ${ask}`,
    }
  }

  const next = nextItems(receivables)
  if (next.length === 0) return null
  const total = next.reduce((acc, it) => acc + sumRemaining(it.installments), 0)
  if (next.length === 1) {
    const { receivable: r, installments } = next[0]
    const i = installments[0]
    return {
      kind: 'reminder',
      subject: `Lembrete de parcela: ${r.description}`,
      totalCents: total,
      text: `${hello} Passando para lembrar da parcela ${i.number} de ${r.installmentCount} (${r.description}), de ${formatBRL(total)}, com vencimento em ${formatDateBR(i.dueDate)}. Obrigado!`,
    }
  }
  const lines = next.map(({ receivable: r, installments }) => {
    const i = installments[0]
    return `• ${r.description}: parcela ${i.number} de ${r.installmentCount}, ${formatBRL(installmentRemaining(i))}, vence em ${formatDateBR(i.dueDate)}`
  })
  return {
    kind: 'reminder',
    subject: 'Lembrete de parcelas',
    totalCents: total,
    text: `${hello} Passando para lembrar das próximas parcelas:\n${lines.join('\n')}\nObrigado!`,
  }
}
