import { dueDateFor, monthsBetween } from './dates'
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

/** A conta gera lançamento nesta competência? (ativa, já iniciada e dentro da periodicidade) */
export function billAppliesTo(bill: Bill, competence: Competence): boolean {
  if (!bill.active) return false
  const diff = monthsBetween(bill.startMonth, competence)
  return diff >= 0 && diff % RECURRENCE_STEP[bill.recurrence] === 0
}

export function buildEntry(bill: Bill, competence: Competence): Entry {
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
  }
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

/** Valida CNPJ pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCnpj(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}
