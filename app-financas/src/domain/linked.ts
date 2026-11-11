import { competenceOf } from './dates'
import { amountDue } from './entries'
import { installmentRemaining } from './receivables'
import type { Competence, Entry, Person, Receivable } from './types'

/**
 * Conta a receber ligada a uma conta a pagar ("gasto real").
 * Exemplo: a fatura do cartão de novembro foi R$ 1.000 e a Ana devolve R$ 500 nesse mês: o gasto real da fatura é R$ 500.
 * As parcelas a receber ligadas descontam da conta do mesmo mês em que vencem (cada fatura traz a parcela do mês).
 */

export interface LinkedPerson {
  personId: string
  name: string
  cents: number
}

export interface EntryLink {
  /** Parcelas ligadas que vencem no mês da conta. */
  receivableCents: number
  /** Quanto delas já foi recebido e quanto ainda falta. */
  receivedCents: number
  openCents: number
  /** O que se paga (ou deve pagar) na conta. */
  grossCents: number
  /** O que sobra depois de descontar o que as pessoas devolvem. Nunca fica negativo. */
  realCents: number
  people: LinkedPerson[]
}

const keyOf = (billId: string, competence: Competence) => `${billId}|${competence}`

interface Bucket {
  total: number
  received: number
  open: number
  byPerson: Map<string, number>
}

function bucketsOf(receivables: Receivable[]): Map<string, Bucket> {
  const out = new Map<string, Bucket>()
  for (const r of receivables) {
    if (!r.billId) continue
    for (const i of r.installments) {
      const key = keyOf(r.billId, competenceOf(i.dueDate))
      const b = out.get(key) ?? { total: 0, received: 0, open: 0, byPerson: new Map<string, number>() }
      b.total += i.amountCents
      const rest = installmentRemaining(i)
      b.open += rest
      b.received += i.amountCents - rest
      b.byPerson.set(r.personId, (b.byPerson.get(r.personId) ?? 0) + i.amountCents)
      out.set(key, b)
    }
  }
  return out
}

const grossOf = (e: Entry) => (e.paidAt !== null ? (e.paidAmountCents ?? amountDue(e)) : amountDue(e))

/** O que está ligado a este lançamento, ou null se nenhuma compra a receber se refere à conta neste mês. */
export function linkOfEntry(entry: Entry, receivables: Receivable[], people: Person[] = []): EntryLink | null {
  const bucket = bucketsOf(receivables).get(keyOf(entry.billId, entry.competence))
  if (!bucket) return null
  const names = new Map(people.map((p) => [p.id, p.name]))
  const gross = grossOf(entry)
  return {
    receivableCents: bucket.total,
    receivedCents: bucket.received,
    openCents: bucket.open,
    grossCents: gross,
    realCents: Math.max(gross - bucket.total, 0),
    people: [...bucket.byPerson.entries()].map(([personId, cents]) => ({ personId, name: names.get(personId) ?? 'Pessoa', cents })),
  }
}

/** Compras a receber que se referem a esta conta (para avisar antes de excluí-la). */
export function receivablesOfBill(billId: string, receivables: Receivable[]): Receivable[] {
  return receivables.filter((r) => r.billId === billId)
}

export interface Netted {
  entries: Entry[]
  /** As compras a receber sem as parcelas que já foram descontadas de uma conta (para não contar duas vezes). */
  receivables: Receivable[]
  /** Quanto foi descontado das contas, e quanto disso ainda não foi recebido. */
  reimbursedCents: number
  notReceivedCents: number
}

/**
 * Visão "real": desconta das contas a pagar o que as pessoas devolvem por elas.
 * A parcela só sai do "a receber" se a conta do mesmo mês existe; sem conta no mês, ela continua como está.
 */
export function netOfReimbursements(entries: Entry[], receivables: Receivable[]): Netted {
  const buckets = bucketsOf(receivables)
  if (buckets.size === 0) return { entries, receivables, reimbursedCents: 0, notReceivedCents: 0 }
  const consumed = new Set<string>()
  let reimbursed = 0
  let notReceived = 0
  const net = entries.map((e) => {
    const key = keyOf(e.billId, e.competence)
    const b = buckets.get(key)
    if (!b) return e
    const due = amountDue(e)
    const cut = Math.min(b.total, due)
    consumed.add(key)
    reimbursed += cut
    notReceived += Math.min(b.open, cut)
    const lessBy = (v: number) => Math.max(v - b.total, 0)
    return {
      ...e,
      expectedAmountCents: lessBy(e.expectedAmountCents),
      chargedAmountCents: e.chargedAmountCents === null ? null : lessBy(e.chargedAmountCents),
      paidAmountCents: e.paidAmountCents === null ? null : lessBy(e.paidAmountCents),
    }
  })
  const rest = receivables.map((r) =>
    r.billId ? { ...r, installments: r.installments.filter((i) => !consumed.has(keyOf(r.billId!, competenceOf(i.dueDate)))) } : r,
  )
  return { entries: net, receivables: rest, reimbursedCents: reimbursed, notReceivedCents: notReceived }
}
