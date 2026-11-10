import { diffDays } from './dates'
import type { DisplayStatus, Entry, IsoDate } from './types'

export const DUE_SOON_DAYS = 7

/** Valor a pagar: o cobrado (se já chegou a cobrança) ou o esperado. */
export function amountDue(e: Entry): number {
  return e.chargedAmountCents ?? e.expectedAmountCents
}

export function isFullyPaid(e: Entry): boolean {
  return e.paidAt !== null && (e.paidAmountCents ?? 0) >= amountDue(e)
}

export function remainingCents(e: Entry): number {
  if (e.paidAt === null) return amountDue(e)
  return Math.max(amountDue(e) - (e.paidAmountCents ?? 0), 0)
}

/** Ainda falta pagar? Conta sem pagamento registrado é pendente mesmo se o valor ainda for zero (a informar). */
export function isPending(e: Entry): boolean {
  return e.paidAt === null || remainingCents(e) > 0
}

export function displayStatus(e: Entry, today: IsoDate): DisplayStatus {
  if (e.paidAt !== null) return isFullyPaid(e) ? 'paga' : 'parcial'
  const days = diffDays(today, e.dueDate)
  if (days < 0) return 'atrasada'
  if (days <= DUE_SOON_DAYS) return 'vence_em_breve'
  if (e.chargedAmountCents !== null) return 'cobranca_recebida'
  return 'prevista'
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  paga: 'Paga',
  parcial: 'Parcial',
  atrasada: 'Atrasada',
  vence_em_breve: 'Vence em breve',
  cobranca_recebida: 'Cobrança recebida',
  prevista: 'Prevista',
}

export interface Summary {
  totalCents: number
  paidCents: number
  remainingCents: number
  pendingCount: number
  overdueCount: number
  dueSoonCount: number
}

export function summarize(entries: Entry[], today: IsoDate): Summary {
  const s: Summary = {
    totalCents: 0,
    paidCents: 0,
    remainingCents: 0,
    pendingCount: 0,
    overdueCount: 0,
    dueSoonCount: 0,
  }
  for (const e of entries) {
    s.totalCents += amountDue(e)
    s.paidCents += Math.min(e.paidAmountCents ?? 0, amountDue(e))
    s.remainingCents += remainingCents(e)
    if (isPending(e)) {
      s.pendingCount += 1
      const status = displayStatus(e, today)
      if (status === 'atrasada') s.overdueCount += 1
      if (status === 'vence_em_breve') s.dueSoonCount += 1
    }
  }
  return s
}

/** Ordena por vencimento e, em empate, por nome. */
export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.billName.localeCompare(b.billName, 'pt-BR'),
  )
}
