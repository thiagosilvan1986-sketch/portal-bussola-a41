import { missingEntries } from './bills'
import { addMonths, competenceOf } from './dates'
import { amountDue, isPending, remainingCents } from './entries'
import { installmentRemaining, isSettled } from './receivables'
import type { Bill, Competence, Entry, IsoDate, Person, Receivable, ReceivableKind } from './types'

/* ---------- Períodos ---------- */

export type PeriodKind = 'trimestre' | 'semestre' | 'ano'

export const PERIOD_KINDS: PeriodKind[] = ['trimestre', 'semestre', 'ano']

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  ano: 'Ano',
}

/** Meses em cada tipo de período. */
export const PERIOD_MONTHS: Record<PeriodKind, number> = { trimestre: 3, semestre: 6, ano: 12 }

export interface Period {
  kind: PeriodKind
  year: number
  /** Posição dentro do ano, a partir de 1: trimestre 1–4, semestre 1–2, ano 1. */
  index: number
}

/** O período do tipo pedido que contém a data. */
export function periodOf(kind: PeriodKind, date: IsoDate): Period {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return { kind, year, index: Math.floor((month - 1) / PERIOD_MONTHS[kind]) + 1 }
}

function periodsPerYear(kind: PeriodKind): number {
  return 12 / PERIOD_MONTHS[kind]
}

export function firstMonth(p: Period): Competence {
  const month = (p.index - 1) * PERIOD_MONTHS[p.kind] + 1
  return `${p.year}-${String(month).padStart(2, '0')}`
}

export function periodMonths(p: Period): Competence[] {
  const first = firstMonth(p)
  return Array.from({ length: PERIOD_MONTHS[p.kind] }, (_, k) => addMonths(first, k))
}

/** Anda `delta` períodos (negativo volta). */
export function shiftPeriod(p: Period, delta: number): Period {
  const per = periodsPerYear(p.kind)
  const absolute = p.year * per + (p.index - 1) + delta
  return { kind: p.kind, year: Math.floor(absolute / per), index: (((absolute % per) + per) % per) + 1 }
}

export function samePeriod(a: Period, b: Period): boolean {
  return a.kind === b.kind && a.year === b.year && a.index === b.index
}

/** "3º trimestre de 2026", "2º semestre de 2026", "2026". */
export function periodTitle(p: Period): string {
  if (p.kind === 'ano') return String(p.year)
  return `${p.index}º ${p.kind} de ${p.year}`
}

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2026-07" -> "jul" */
export function monthAbbr(c: Competence): string {
  return MONTH_NAMES[Number(c.slice(5, 7)) - 1]
}

/** "jul a set" (ou "jan a dez"): o intervalo de meses do período. */
export function periodSpan(p: Period): string {
  const months = periodMonths(p)
  return `${monthAbbr(months[0])} a ${monthAbbr(months[months.length - 1])}`
}

/* ---------- Valores por mês ---------- */

export interface MonthReport {
  competence: Competence
  /** Contas a pagar do mês (pela competência do lançamento). */
  payTotalCents: number
  payPaidCents: number
  payOpenCents: number
  payOverdueCents: number
  /** Parcelas a receber que vencem no mês. */
  recvTotalCents: number
  recvReceivedCents: number
  recvOpenCents: number
  recvOverdueCents: number
  /** True se o mês usa o valor previsto das contas, porque ainda não há lançamento. */
  projected: boolean
}

export type Totals = Omit<MonthReport, 'competence' | 'projected'>

const ZERO: Totals = {
  payTotalCents: 0,
  payPaidCents: 0,
  payOpenCents: 0,
  payOverdueCents: 0,
  recvTotalCents: 0,
  recvReceivedCents: 0,
  recvOpenCents: 0,
  recvOverdueCents: 0,
}

/**
 * Lançamentos do período. Para os meses de hoje em diante que ainda não têm lançamento
 * (o app só cria o mês atual e o próximo), usa a previsão das contas cadastradas.
 * Meses passados nunca são inventados: só entra o que foi lançado.
 */
export function entriesWithProjection(
  entries: Entry[],
  bills: Bill[],
  months: Competence[],
  today: IsoDate,
): { entries: Entry[]; projectedMonths: Set<Competence> } {
  const thisMonth = competenceOf(today)
  const future = months.filter((c) => c >= thisMonth)
  const projected = missingEntries(bills, new Set(entries.map((e) => e.id)), future)
  return { entries: [...entries, ...projected], projectedMonths: new Set(projected.map((e) => e.competence)) }
}

export function monthlyReport(
  months: Competence[],
  entries: Entry[],
  receivables: Receivable[],
  today: IsoDate,
  projectedMonths: ReadonlySet<Competence> = new Set(),
): MonthReport[] {
  const rows = new Map<Competence, MonthReport>(
    months.map((competence) => [competence, { competence, ...ZERO, projected: projectedMonths.has(competence) }]),
  )
  for (const e of entries) {
    const row = rows.get(e.competence)
    if (!row) continue
    const due = amountDue(e)
    row.payTotalCents += due
    row.payPaidCents += Math.min(e.paidAmountCents ?? 0, due)
    const rest = remainingCents(e)
    row.payOpenCents += rest
    if (isPending(e) && e.dueDate < today) row.payOverdueCents += rest
  }
  for (const r of receivables) {
    for (const i of r.installments) {
      const row = rows.get(competenceOf(i.dueDate))
      if (!row) continue
      row.recvTotalCents += i.amountCents
      row.recvReceivedCents += i.paidAt !== null ? (i.paidAmountCents ?? 0) : 0
      if (!isSettled(i)) {
        const rest = installmentRemaining(i)
        row.recvOpenCents += rest
        if (i.dueDate < today) row.recvOverdueCents += rest
      }
    }
  }
  return months.map((c) => rows.get(c)!)
}

export function sumMonths(rows: MonthReport[]): Totals {
  const out = { ...ZERO }
  for (const row of rows) {
    out.payTotalCents += row.payTotalCents
    out.payPaidCents += row.payPaidCents
    out.payOpenCents += row.payOpenCents
    out.payOverdueCents += row.payOverdueCents
    out.recvTotalCents += row.recvTotalCents
    out.recvReceivedCents += row.recvReceivedCents
    out.recvOpenCents += row.recvOpenCents
    out.recvOverdueCents += row.recvOverdueCents
  }
  return out
}

/** Saldo previsto: o que entra menos o que sai, pelo total do período. Negativo = vai faltar dinheiro. */
export function expectedBalance(t: Pick<Totals, 'recvTotalCents' | 'payTotalCents'>): number {
  return t.recvTotalCents - t.payTotalCents
}

/** Saldo realizado: o que já entrou menos o que já foi pago. */
export function realizedBalance(t: Pick<Totals, 'recvReceivedCents' | 'payPaidCents'>): number {
  return t.recvReceivedCents - t.payPaidCents
}

/** Quanto do total já foi cumprido (0 a 100); 0 se não há nada. */
export function percentDone(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

/* ---------- Detalhamentos ---------- */

export interface CategoryShare {
  category: string
  totalCents: number
  /** 0 a 100. */
  share: number
}

/** Onde o dinheiro vai: as maiores categorias de contas a pagar; as menores viram "Outras categorias". */
export function byCategory(entries: Entry[], months: Competence[], keep = 6): CategoryShare[] {
  const inRange = new Set(months)
  const sums = new Map<string, number>()
  let total = 0
  for (const e of entries) {
    if (!inRange.has(e.competence)) continue
    const due = amountDue(e)
    if (due <= 0) continue
    sums.set(e.category, (sums.get(e.category) ?? 0) + due)
    total += due
  }
  if (total === 0) return []
  const ranked = [...sums.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  const head = ranked.slice(0, keep)
  const rest = ranked.slice(keep).reduce((acc, [, cents]) => acc + cents, 0)
  const list = rest > 0 ? [...head, ['Outras categorias', rest] as [string, number]] : head
  return list.map(([category, totalCents]) => ({ category, totalCents, share: Math.round((totalCents / total) * 100) }))
}

export interface DebtorRow {
  personId: string
  name: string
  openCents: number
  overdueCents: number
}

/** Quem tem mais a pagar no período (parcelas que vencem nele e ainda não foram quitadas). */
export function topDebtors(
  receivables: Receivable[],
  people: Person[],
  months: Competence[],
  today: IsoDate,
  limit = 5,
  kind?: ReceivableKind,
): DebtorRow[] {
  const inRange = new Set(months)
  const names = new Map(people.map((p) => [p.id, p.name]))
  const rows = new Map<string, DebtorRow>()
  for (const r of receivables) {
    if (kind && r.kind !== kind) continue
    for (const i of r.installments) {
      if (!inRange.has(competenceOf(i.dueDate)) || isSettled(i)) continue
      const rest = installmentRemaining(i)
      const row = rows.get(r.personId) ?? { personId: r.personId, name: names.get(r.personId) ?? 'Pessoa', openCents: 0, overdueCents: 0 }
      row.openCents += rest
      if (i.dueDate < today) row.overdueCents += rest
      rows.set(r.personId, row)
    }
  }
  return [...rows.values()]
    .filter((row) => row.openCents > 0)
    .sort((a, b) => b.openCents - a.openCents || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, limit)
}

/** Valor curto para os eixos do gráfico: "R$ 850", "R$ 1,5 mil", "R$ 12 mil". */
export function compactBRL(cents: number): string {
  const reais = cents / 100
  if (reais >= 1000) {
    const mil = reais / 1000
    const text = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: mil >= 10 ? 0 : 1 }).format(mil)
    return `R$ ${text} mil`
  }
  return `R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(reais)}`
}

/** Teto "redondo" do eixo y: 1, 2, 2,5, 5 ou 10 vezes uma potência de 10. */
export function niceCeil(cents: number): number {
  if (cents <= 0) return 10_000
  const magnitude = 10 ** Math.floor(Math.log10(cents))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude >= cents) return step * magnitude
  return 10 * magnitude
}
