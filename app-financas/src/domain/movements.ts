import { competenceOf } from './dates'
import { amountDue, displayStatus, isPending, remainingCents } from './entries'
import { installmentRemaining, installmentStatus, isSettled, parcelShort } from './receivables'
import { byName } from './text'
import type { Bill, Competence, DisplayStatus, Entry, Installment, IsoDate, Person, Receivable } from './types'

/**
 * Movimentação do mês na Início: as contas a pagar e as parcelas a receber, numa lista só,
 * com os filtros Tudo | A pagar | A receber, Situação e Categoria.
 */
export type Side = 'tudo' | 'pagar' | 'receber'
export const SIDES: Side[] = ['tudo', 'pagar', 'receber']
export const SIDE_LABEL: Record<Side, string> = { tudo: 'Tudo', pagar: 'A pagar', receber: 'A receber' }

export type Situation = 'todas' | 'pendentes' | 'quitadas' | 'atrasadas'
export const SITUATIONS: Situation[] = ['todas', 'pendentes', 'quitadas', 'atrasadas']
export const SITUATION_LABEL: Record<Situation, string> = {
  todas: 'Todas',
  pendentes: 'Pendentes',
  quitadas: 'Pagas e recebidas',
  atrasadas: 'Atrasadas',
}

export type Movement =
  | { kind: 'conta'; key: string; name: string; dueDate: IsoDate; shownCents: number; status: DisplayStatus; pending: boolean; category: string; entry: Entry }
  | {
      kind: 'parcela'
      key: string
      name: string
      dueDate: IsoDate
      shownCents: number
      status: DisplayStatus
      pending: boolean
      /** Categoria da conta ligada (rateio, reembolso), se houver. */
      category: string | null
      receivable: Receivable
      installment: Installment
      personName: string
    }

/** As parcelas a receber que vencem no mês, com o nome de quem paga. */
export function monthMovements(entries: Entry[], receivables: Receivable[], people: readonly Person[], bills: readonly Bill[], competence: Competence, today: IsoDate): Movement[] {
  const who = new Map(people.map((p) => [p.id, p.name]))
  const billCategory = new Map(bills.map((b) => [b.id, b.category]))
  const out: Movement[] = entries.map((e) => {
    const pending = isPending(e)
    return {
      kind: 'conta',
      key: `c:${e.id}`,
      name: e.billName,
      dueDate: e.dueDate,
      shownCents: pending ? remainingCents(e) : amountDue(e),
      status: displayStatus(e, today),
      pending,
      category: e.category,
      entry: e,
    }
  })
  for (const r of receivables)
    for (const i of r.installments) {
      if (competenceOf(i.dueDate) !== competence) continue
      const settled = isSettled(i)
      const personName = who.get(r.personId) ?? 'Pessoa'
      const short = parcelShort(r, i)
      out.push({
        kind: 'parcela',
        key: `p:${r.id}:${i.number}`,
        name: `${personName} · ${r.description}${short && r.recurring !== true ? ` ${short}` : ''}`,
        dueDate: i.dueDate,
        shownCents: settled ? (i.paidAmountCents ?? i.amountCents) : installmentRemaining(i),
        status: installmentStatus(i, today),
        pending: !settled,
        category: r.billId ? (billCategory.get(r.billId) ?? null) : null,
        receivable: r,
        installment: i,
        personName,
      })
    }
  return out
}

export function filterMovements(list: Movement[], f: { side: Side; situation: Situation; category: string }): Movement[] {
  return list.filter((m) => {
    if (f.side === 'pagar' && m.kind !== 'conta') return false
    if (f.side === 'receber' && m.kind !== 'parcela') return false
    if (f.situation === 'pendentes' && !m.pending) return false
    if (f.situation === 'quitadas' && m.pending) return false
    if (f.situation === 'atrasadas' && m.status !== 'atrasada') return false
    if (f.category && m.category !== f.category) return false
    return true
  })
}

/** Nome (A–Z, padrão), vencimento ou valor; no empate, vencimento e depois nome. */
export function sortMovements(list: Movement[], choice: { key: string; dir: string }): Movement[] {
  const sign = choice.dir === 'desc' ? -1 : 1
  const tie = (a: Movement, b: Movement) => a.dueDate.localeCompare(b.dueDate) || byName(a.name, b.name)
  return [...list].sort((a, b) => {
    const main =
      choice.key === 'valor' ? a.shownCents - b.shownCents : choice.key === 'vencimento' ? a.dueDate.localeCompare(b.dueDate) : byName(a.name, b.name)
    return sign * main || tie(a, b)
  })
}

export interface MonthTotals {
  pay: { totalCents: number; doneCents: number; remainingCents: number; pendingCount: number; overdueCount: number; count: number }
  recv: { totalCents: number; doneCents: number; remainingCents: number; pendingCount: number; overdueCount: number; count: number }
}

/** Totais do mês para os cartões do resumo: o que sai, o que entra e quanto disso já foi pago ou recebido. */
export function monthTotals(list: Movement[]): MonthTotals {
  const empty = () => ({ totalCents: 0, doneCents: 0, remainingCents: 0, pendingCount: 0, overdueCount: 0, count: 0 })
  const t: MonthTotals = { pay: empty(), recv: empty() }
  for (const m of list) {
    const side = m.kind === 'conta' ? t.pay : t.recv
    const total = m.kind === 'conta' ? amountDue(m.entry) : m.installment.amountCents
    const rest = m.pending ? m.shownCents : 0
    side.count += 1
    side.totalCents += total
    side.remainingCents += rest
    side.doneCents += Math.max(total - rest, 0)
    if (m.pending) side.pendingCount += 1
    if (m.status === 'atrasada') side.overdueCount += 1
  }
  return t
}
