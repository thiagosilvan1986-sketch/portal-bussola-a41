import { missingEntries } from './bills'
import { addMonths, competenceOf } from './dates'
import { amountDue, isPending, remainingCents } from './entries'
import { installmentRemaining, isSettled } from './receivables'
import type { Bill, Competence, Entry, IsoDate, Person, Receivable, ReceivableKind } from './types'

/* ---------- Períodos ---------- */

export type PeriodKind = 'mes' | 'trimestre' | 'semestre' | 'ano'

export const PERIOD_KINDS: PeriodKind[] = ['mes', 'trimestre', 'semestre', 'ano']

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  mes: 'Mês',
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  ano: 'Ano',
}

/** Meses em cada tipo de período. */
export const PERIOD_MONTHS: Record<PeriodKind, number> = { mes: 1, trimestre: 3, semestre: 6, ano: 12 }

export interface Period {
  kind: PeriodKind
  year: number
  /** Posição dentro do ano, a partir de 1: mês 1–12, trimestre 1–4, semestre 1–2, ano 1. */
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

const MONTH_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** "Novembro de 2026", "3º trimestre de 2026", "2º semestre de 2026", "2026". */
export function periodTitle(p: Period): string {
  if (p.kind === 'ano') return String(p.year)
  if (p.kind === 'mes') return `${MONTH_FULL[p.index - 1]} de ${p.year}`
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

/** Valor curto para os eixos do gráfico: "R$ 850", "R$ 1,5 mil", "R$ 12 mil"; negativo vem com sinal de menos ("−R$ 12 mil"). */
export function compactBRL(cents: number): string {
  const reais = Math.abs(cents) / 100
  const sign = cents < 0 ? '−' : ''
  if (reais >= 1000) {
    const mil = reais / 1000
    const text = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: mil >= 10 ? 0 : 1 }).format(mil)
    return `${sign}R$ ${text} mil`
  }
  return `${sign}R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(reais)}`
}

/** Teto "redondo" do eixo y: 1, 2, 3, 4, 5, 6, 8 ou 10 vezes uma potência de 10 (perde pouco espaço no gráfico). */
export function niceCeil(cents: number): number {
  if (cents <= 0) return 10_000
  const magnitude = 10 ** Math.floor(Math.log10(cents))
  for (const step of [1, 2, 3, 4, 5, 6, 8, 10]) if (step * magnitude >= cents) return step * magnitude
  return 10 * magnitude
}

/* ---------- Filtro, comparação e acumulado ---------- */

/** O que o relatório mostra: tudo, só o que se paga ou só o que se recebe. */
export type Scope = 'tudo' | 'pagar' | 'receber'

export const SCOPES: Scope[] = ['tudo', 'pagar', 'receber']

export const SCOPE_LABEL: Record<Scope, string> = { tudo: 'Tudo', pagar: 'A pagar', receber: 'A receber' }

/** "mês anterior", "trimestre anterior", "semestre anterior", "ano anterior": o termo de comparação de cada tipo de período. */
export const PREVIOUS_LABEL: Record<PeriodKind, string> = {
  mes: 'mês anterior',
  trimestre: 'trimestre anterior',
  semestre: 'semestre anterior',
  ano: 'ano anterior',
}

/** Variação em % de `now` contra `before` (arredondada). Sem base de comparação (antes = 0), devolve null. */
export function percentChange(now: number, before: number): number | null {
  if (before === 0) return null
  return Math.round(((now - before) / Math.abs(before)) * 100)
}

/** Quanto do que entra sobra, em %. Só existe quando entra algo e não falta dinheiro. */
export function savingsRate(t: Pick<Totals, 'recvTotalCents' | 'payTotalCents'>): number | null {
  if (t.recvTotalCents <= 0) return null
  const balance = expectedBalance(t)
  if (balance < 0) return null
  return Math.round((balance / t.recvTotalCents) * 100)
}

/** Quanto do que sai o que entra cobre, em %. Sem contas a pagar, não há o que cobrir. */
export function coverage(t: Pick<Totals, 'recvTotalCents' | 'payTotalCents'>): number | null {
  if (t.payTotalCents <= 0) return null
  return Math.round((t.recvTotalCents / t.payTotalCents) * 100)
}

/**
 * Valor acumulado mês a mês. Em "tudo" é o saldo (entra menos sai) e pode ficar negativo;
 * em "pagar" e "receber" é o total que vai se somando.
 */
export function cumulativeSeries(rows: MonthReport[], scope: Scope): number[] {
  let acc = 0
  return rows.map((r) => {
    acc += scope === 'pagar' ? r.payTotalCents : scope === 'receber' ? r.recvTotalCents : r.recvTotalCents - r.payTotalCents
    return acc
  })
}

/** Primeiro mês em que o saldo acumulado fica negativo; null se nunca falta. */
export function firstShortfall(rows: MonthReport[], series: number[]): Competence | null {
  const k = series.findIndex((v) => v < 0)
  return k === -1 ? null : rows[k].competence
}

/* ---------- Mapa de vencimentos ---------- */

export interface DueDay {
  /** 1 a 31 */
  day: number
  totalCents: number
  count: number
}

/** Em que dia do mês cai cada vencimento do período: 31 posições, do dia 1 ao 31. */
export function dueDayMap(entries: Entry[], receivables: Receivable[], months: Competence[], scope: 'pagar' | 'receber'): DueDay[] {
  const inRange = new Set(months)
  const days: DueDay[] = Array.from({ length: 31 }, (_, k) => ({ day: k + 1, totalCents: 0, count: 0 }))
  const add = (dueDate: IsoDate, cents: number) => {
    if (cents <= 0) return
    const slot = days[Number(dueDate.slice(8, 10)) - 1]
    if (!slot) return
    slot.totalCents += cents
    slot.count += 1
  }
  if (scope === 'pagar') {
    for (const e of entries) if (inRange.has(e.competence)) add(e.dueDate, amountDue(e))
  } else {
    for (const r of receivables) for (const i of r.installments) if (inRange.has(competenceOf(i.dueDate))) add(i.dueDate, i.amountCents)
  }
  return days
}

/** Nível de 0 (nada) a `levels` (o dia mais carregado) para pintar o mapa. */
export function heatLevel(cents: number, max: number, levels = 5): number {
  if (cents <= 0 || max <= 0) return 0
  return Math.max(1, Math.min(levels, Math.ceil((cents / max) * levels)))
}

/* ---------- Categorias: fatias, detalhe e evolução ---------- */

export const OTHER_CATEGORIES = 'Outras categorias'

export interface CategorySlice {
  /** Nome da categoria, ou "Outras categorias" para a soma das menores. */
  category: string
  totalCents: number
  /** 0 a 100. */
  share: number
  /** Categorias reais dentro da fatia (uma só, exceto em "Outras categorias"). */
  members: string[]
  /** Posição na paleta (0 a keep−1), pela ordem de tamanho; null em "Outras categorias". */
  slot: number | null
}

/** Todas as categorias com conta a pagar no período, da maior para a menor. */
export function rankCategories(entries: Entry[], months: Competence[]): { category: string; totalCents: number }[] {
  const inRange = new Set(months)
  const sums = new Map<string, number>()
  for (const e of entries) {
    if (!inRange.has(e.competence)) continue
    const due = amountDue(e)
    if (due > 0) sums.set(e.category, (sums.get(e.category) ?? 0) + due)
  }
  return [...sums.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category, 'pt-BR'))
}

/** As `keep` maiores categorias viram fatias; as demais se juntam em "Outras categorias". */
export function categorySlices(entries: Entry[], months: Competence[], keep = 5): CategorySlice[] {
  const ranked = rankCategories(entries, months)
  const total = ranked.reduce((acc, c) => acc + c.totalCents, 0)
  if (total === 0) return []
  const share = (cents: number) => Math.round((cents / total) * 100)
  const head: CategorySlice[] = ranked
    .slice(0, keep)
    .map((c, k) => ({ category: c.category, totalCents: c.totalCents, share: share(c.totalCents), members: [c.category], slot: k }))
  const tail = ranked.slice(keep)
  if (tail.length === 0) return head
  const rest = tail.reduce((acc, c) => acc + c.totalCents, 0)
  return [...head, { category: OTHER_CATEGORIES, totalCents: rest, share: share(rest), members: tail.map((c) => c.category), slot: null }]
}

/** A fatia que contém a categoria escolhida (a própria, ou "Outras categorias"). */
export function sliceOf(slices: CategorySlice[], category: string | null): CategorySlice | null {
  if (!category) return null
  return slices.find((s) => s.members.includes(category)) ?? null
}

/** Contas a pagar das categorias, no período, em ordem de vencimento. */
export function categoryEntries(entries: Entry[], months: Competence[], members: string[]): Entry[] {
  const inRange = new Set(months)
  const names = new Set(members)
  return entries
    .filter((e) => inRange.has(e.competence) && names.has(e.category) && amountDue(e) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.expectedAmountCents - a.expectedAmountCents)
}

/** Total a pagar das categorias em cada mês do período (para ver a evolução). */
export function categoryTrend(entries: Entry[], months: Competence[], members: string[]): number[] {
  const names = new Set(members)
  const sums = new Map<Competence, number>(months.map((c) => [c, 0]))
  for (const e of entries) {
    if (!names.has(e.category) || !sums.has(e.competence)) continue
    sums.set(e.competence, sums.get(e.competence)! + Math.max(0, amountDue(e)))
  }
  return months.map((c) => sums.get(c)!)
}

/* ---------- Fluxo do dinheiro ---------- */

export interface FlowNode {
  key: string
  label: string
  cents: number
  kind: 'recv' | 'gap' | 'category' | 'surplus'
  slot: number | null
  members: string[]
}

export interface FlowModel {
  /** De onde vem o dinheiro: o que se recebe e, se não bastar, o que falta. */
  sources: FlowNode[]
  /** Para onde vai: as categorias e, se sobrar, a sobra. */
  targets: FlowNode[]
  /** Soma de cada lado (os dois lados fecham). */
  totalCents: number
}

/** Monta o fluxo "entra → categorias → sobra". Se faltar dinheiro, a falta entra como origem para os dois lados fecharem. */
export function flowModel(slices: CategorySlice[], recvCents: number): FlowModel | null {
  const pay = slices.reduce((acc, s) => acc + s.totalCents, 0)
  if (pay <= 0) return null
  const recv = Math.max(0, recvCents)
  const sources: FlowNode[] = []
  if (recv > 0) sources.push({ key: 'recv', label: 'A receber', cents: recv, kind: 'recv', slot: null, members: [] })
  if (pay > recv) sources.push({ key: 'gap', label: 'Falta', cents: pay - recv, kind: 'gap', slot: null, members: [] })
  const targets: FlowNode[] = slices.map((s) => ({
    key: `cat:${s.category}`,
    label: s.category,
    cents: s.totalCents,
    kind: 'category',
    slot: s.slot,
    members: s.members,
  }))
  if (recv > pay) targets.push({ key: 'surplus', label: 'Sobra', cents: recv - pay, kind: 'surplus', slot: null, members: [] })
  return { sources, targets, totalCents: Math.max(pay, recv) }
}
