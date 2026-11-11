import { addMonths, dueDateFor, monthsBetween } from './dates'
import type { Bill, Competence, Entry, Recurrence } from './types'

export const RECURRENCE_STEP: Record<Recurrence, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  yearly: 12,
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

export function entryId(billId: string, competence: Competence): string {
  return `${billId}_${competence}`
}

export const MAX_BILL_INSTALLMENTS = 360

/** Número da parcela (1, 2, 3…) que cai nesta competência, contando de "Começa em"; null se a competência não é uma parcela da conta. */
export function installmentNumberAt(bill: Pick<Bill, 'startMonth' | 'recurrence'>, competence: Competence): number | null {
  const diff = monthsBetween(bill.startMonth, competence)
  const step = RECURRENCE_STEP[bill.recurrence]
  return diff >= 0 && diff % step === 0 ? diff / step + 1 : null
}

/** Competência da última parcela, dado o começo, a repetição e o número de parcelas. */
export function endCompetence(startMonth: Competence, recurrence: Recurrence, count: number): Competence {
  return addMonths(startMonth, RECURRENCE_STEP[recurrence] * (count - 1))
}

/**
 * Quantas parcelas cabem do começo até o mês final, na repetição escolhida. Se o mês final não cai numa parcela
 * (por exemplo, trimestral), vale a última parcela antes dele. Null se o fim é antes do começo.
 */
export function installmentsUntil(startMonth: Competence, endMonth: Competence, recurrence: Recurrence): number | null {
  const diff = monthsBetween(startMonth, endMonth)
  return diff < 0 ? null : Math.floor(diff / RECURRENCE_STEP[recurrence]) + 1
}

/** A conta gera lançamento nesta competência? (ativa, já iniciada, dentro da periodicidade e antes do fim, se tiver parcelas) */
export function billAppliesTo(bill: Bill, competence: Competence): boolean {
  if (!bill.active) return false
  if (bill.skippedMonths?.includes(competence)) return false
  const n = installmentNumberAt(bill, competence)
  if (n === null) return false
  return !bill.installmentCount || n <= bill.installmentCount
}

export function buildEntry(bill: Bill, competence: Competence): Entry {
  const number = bill.installmentCount ? installmentNumberAt(bill, competence) : null
  return {
    id: entryId(bill.id, competence),
    billId: bill.id,
    billName: bill.name,
    category: bill.category,
    competence,
    dueDate: dueDateFor(competence, bill.dueDay),
    expectedAmountCents: bill.expectedAmountCents,
    chargedAmountCents: null,
    paidAmountCents: null,
    paidAt: null,
    barcode: '',
    note: '',
    ...(number !== null && bill.installmentCount ? { installmentNumber: number, installmentTotal: bill.installmentCount } : {}),
  }
}

/** "Parcela 3 de 10", ou null se o lançamento não é de uma conta parcelada. */
export function installmentLabel(e: Pick<Entry, 'installmentNumber' | 'installmentTotal'>): string | null {
  return e.installmentNumber && e.installmentTotal ? `Parcela ${e.installmentNumber} de ${e.installmentTotal}` : null
}

/**
 * Lançamentos de uma conta parcelada que já nasce em andamento: as `paidCount` primeiras parcelas entram como pagas
 * (a data do pagamento é o vencimento, porque o app não sabe a real) e as seguintes que já venceram antes do mês atual
 * entram como pendentes (atrasadas). Do mês atual em diante, quem cria é o lançamento automático de sempre.
 */
export function backfillEntries(bill: Bill, paidCount: number, thisMonth: Competence): Entry[] {
  const total = bill.installmentCount ?? 0
  const step = RECURRENCE_STEP[bill.recurrence]
  const out: Entry[] = []
  for (let i = 1; i <= total; i++) {
    const competence = addMonths(bill.startMonth, step * (i - 1))
    const paid = i <= paidCount
    if (!paid && competence >= thisMonth) break
    const entry = buildEntry(bill, competence)
    out.push(paid ? { ...entry, paidAt: entry.dueDate, paidAmountCents: entry.expectedAmountCents } : entry)
  }
  return out
}

/** Lançamentos que ainda não existem para as competências pedidas. */
export function missingEntries(
  bills: Bill[],
  existingIds: ReadonlySet<string>,
  competences: Competence[],
): Entry[] {
  const out: Entry[] = []
  for (const bill of bills) {
    for (const c of competences) {
      if (billAppliesTo(bill, c) && !existingIds.has(entryId(bill.id, c))) {
        out.push(buildEntry(bill, c))
      }
    }
  }
  return out
}
