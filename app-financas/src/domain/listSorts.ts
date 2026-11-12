/**
 * Critérios de ordenação de cada lista do app. Cada tela oferece só o que faz sentido nela, e a ordem de antes
 * continua sendo a padrão: ao abrir pela primeira vez, nada muda de lugar.
 */
import { amountDue } from './entries'
import { OTHER_CATEGORIES } from './reports'
import { summarizeReceivable, type PersonSummary } from './receivables'
import {
  choiceOf,
  sortItems,
  textCompare,
  type SortChoice,
  type SortOption,
  type SortSpec,
} from './sorting'
import type { Bill, Entry, IsoDate, Person, Receivable } from './types'

const byText = <T>(get: (x: T) => string): SortSpec<T> => ({ compare: (a, b) => textCompare(get(a), get(b)) })
const byNumber = <T>(get: (x: T) => number, missing?: (x: T) => boolean): SortSpec<T> => ({ compare: (a, b) => get(a) - get(b), missing })
const byDate = <T>(get: (x: T) => IsoDate | null): SortSpec<T> => ({
  compare: (a, b) => (get(a) ?? '').localeCompare(get(b) ?? ''),
  missing: (x) => get(x) === null,
})

/* ---------- Início e contas de uma categoria: lançamentos do mês ---------- */

export type EntrySortKey = 'vencimento' | 'nome' | 'valor'

export const ENTRY_SORTS: readonly SortOption<EntrySortKey>[] = [
  { key: 'vencimento', label: 'Vencimento', dir: 'asc' },
  { key: 'nome', label: 'Nome', dir: 'asc' },
  { key: 'valor', label: 'Valor', dir: 'desc' },
]
export const ENTRY_SORT_DEFAULT = choiceOf(ENTRY_SORTS[0])

/**
 * Ordena lançamentos. O que empata fica na ordem que a lista já tinha (Início: vencimento e nome), então quem
 * chama passa a lista na ordem de antes. `value` é o valor que a tela mostra na linha.
 */
export function sortEntriesBy(entries: readonly Entry[], choice: SortChoice<EntrySortKey>, value: (e: Entry) => number = amountDue): Entry[] {
  return sortItems(entries, choice, {
    vencimento: { compare: (a, b) => a.dueDate.localeCompare(b.dueDate) },
    nome: byText((e: Entry) => e.billName),
    valor: byNumber(value),
  })
}

/* ---------- A pagar: contas cadastradas ---------- */

export type BillSortKey = 'nome' | 'valor' | 'vencimento'

export const BILL_SORTS: readonly SortOption<BillSortKey>[] = [
  { key: 'nome', label: 'Nome', dir: 'asc' },
  { key: 'valor', label: 'Valor', dir: 'desc' },
  { key: 'vencimento', label: 'Dia do vencimento', dir: 'asc' },
]
export const BILL_SORT_DEFAULT = choiceOf(BILL_SORTS[0])

/** As contas arquivadas ficam sempre no fim da lista, seja qual for o critério. */
export function sortBillsBy(bills: readonly Bill[], choice: SortChoice<BillSortKey>): Bill[] {
  const base = [...bills].sort((a, b) => Number(b.active) - Number(a.active) || textCompare(a.name, b.name))
  return sortItems(
    base,
    choice,
    {
      nome: byText((b: Bill) => b.name),
      valor: byNumber((b: Bill) => b.expectedAmountCents),
      vencimento: byNumber((b: Bill) => b.dueDay),
    },
    (b) => (b.active ? 0 : 1),
  )
}

/* ---------- A receber: pessoas ---------- */

export interface PersonRow {
  person: Person
  summary: PersonSummary
}

export type PersonSortKey = 'situacao' | 'nome' | 'valor' | 'vencimento'

export const PERSON_SORTS: readonly SortOption<PersonSortKey>[] = [
  { key: 'situacao', label: 'Situação (atrasados primeiro)', dir: 'asc', directional: false },
  { key: 'nome', label: 'Nome', dir: 'asc' },
  { key: 'valor', label: 'Valor a receber', dir: 'desc' },
  { key: 'vencimento', label: 'Próximo vencimento', dir: 'asc' },
]
export const PERSON_SORT_DEFAULT = choiceOf(PERSON_SORTS[0])

/** A ordem de sempre: quem tem parcela atrasada, depois quem ainda deve, o maior saldo primeiro, e por nome. */
export const comparePeopleBySituation = (a: PersonRow, b: PersonRow): number =>
  Number(b.summary.overdueCount > 0) - Number(a.summary.overdueCount > 0) ||
  Number(b.summary.remainingCents > 0) - Number(a.summary.remainingCents > 0) ||
  b.summary.remainingCents - a.summary.remainingCents ||
  textCompare(a.person.name, b.person.name)

export function sortPeopleBy(rows: readonly PersonRow[], choice: SortChoice<PersonSortKey>): PersonRow[] {
  const base = [...rows].sort(comparePeopleBySituation)
  return sortItems(base, choice, {
    situacao: { compare: comparePeopleBySituation },
    nome: byText((r: PersonRow) => r.person.name),
    valor: byNumber((r: PersonRow) => r.summary.remainingCents),
    vencimento: byDate((r: PersonRow) => r.summary.nextDueDate),
  })
}

/* ---------- Pessoa: compras ---------- */

export type PurchaseSortKey = 'situacao' | 'nome' | 'valor' | 'vencimento'

export const PURCHASE_SORTS: readonly SortOption<PurchaseSortKey>[] = [
  { key: 'situacao', label: 'Situação (com saldo primeiro)', dir: 'asc', directional: false },
  { key: 'nome', label: 'Nome da compra', dir: 'asc' },
  { key: 'valor', label: 'Valor da compra', dir: 'desc' },
  { key: 'vencimento', label: 'Próxima parcela', dir: 'asc' },
]
export const PURCHASE_SORT_DEFAULT = choiceOf(PURCHASE_SORTS[0])

export function sortPurchasesBy(receivables: readonly Receivable[], choice: SortChoice<PurchaseSortKey>, today: IsoDate): Receivable[] {
  const next = (r: Receivable) => summarizeReceivable(r, today).nextDueDate
  const bySituation = (a: Receivable, b: Receivable) => {
    const sa = summarizeReceivable(a, today)
    const sb = summarizeReceivable(b, today)
    return Number(sb.remainingCents > 0) - Number(sa.remainingCents > 0) || (sa.nextDueDate ?? '9999').localeCompare(sb.nextDueDate ?? '9999')
  }
  const base = [...receivables].sort(bySituation)
  return sortItems(base, choice, {
    situacao: { compare: bySituation },
    nome: byText((r: Receivable) => r.description),
    valor: byNumber((r: Receivable) => r.totalCents),
    vencimento: byDate(next),
  })
}

/* ---------- Relatórios ---------- */

export type DebtorSortKey = 'valor' | 'nome'

export const DEBTOR_SORTS: readonly SortOption<DebtorSortKey>[] = [
  { key: 'valor', label: 'Valor em aberto', dir: 'desc' },
  { key: 'nome', label: 'Nome', dir: 'asc' },
]
export const DEBTOR_SORT_DEFAULT = choiceOf(DEBTOR_SORTS[0])

/** "Quem mais deve": ordena só quem aparece na lista (os maiores devedores do período). */
export function sortDebtorsBy<T extends { name: string; openCents: number }>(rows: readonly T[], choice: SortChoice<DebtorSortKey>): T[] {
  return sortItems(rows, choice, {
    valor: byNumber((r: T) => r.openCents),
    nome: byText((r: T) => r.name),
  })
}

export type SliceSortKey = 'valor' | 'nome'

export const SLICE_SORTS: readonly SortOption<SliceSortKey>[] = [
  { key: 'valor', label: 'Valor', dir: 'desc' },
  { key: 'nome', label: 'Nome', dir: 'asc' },
]
export const SLICE_SORT_DEFAULT = choiceOf(SLICE_SORTS[0])

/** "Outras categorias" (a soma das menores) fica sempre no fim. As cores e a rosquinha não mudam: só a lista. */
export function sortSlicesBy<T extends { category: string; totalCents: number }>(slices: readonly T[], choice: SortChoice<SliceSortKey>): T[] {
  return sortItems(
    slices,
    choice,
    {
      valor: byNumber((s: T) => s.totalCents),
      nome: byText((s: T) => s.category),
    },
    (s) => (s.category === OTHER_CATEGORIES ? 1 : 0),
  )
}

export type MonthSortKey = 'mes' | 'pagar' | 'receber' | 'saldo'

export interface MonthSortShape {
  showPay: boolean
  showRecv: boolean
  /** O saldo só aparece quando se olha a pagar e a receber juntos. */
  showBalance: boolean
  /** "A pagar", ou "Gasto real" na visão que desconta os reembolsos. */
  payLabel: string
}

/** Os critérios do "Detalhamento" seguem as colunas que a tabela mostra. */
export function monthSorts(shape: MonthSortShape): SortOption<MonthSortKey>[] {
  const list: SortOption<MonthSortKey>[] = [{ key: 'mes', label: 'Mês', dir: 'asc' }]
  if (shape.showPay) list.push({ key: 'pagar', label: shape.payLabel, dir: 'desc' })
  if (shape.showRecv) list.push({ key: 'receber', label: 'A receber', dir: 'desc' })
  if (shape.showBalance) list.push({ key: 'saldo', label: 'Saldo', dir: 'desc' })
  return list
}
export const MONTH_SORT_DEFAULT: SortChoice<MonthSortKey> = { key: 'mes', dir: 'asc' }

export function sortMonthsBy<T extends { competence: string; payTotalCents: number; recvTotalCents: number }>(
  rows: readonly T[],
  choice: SortChoice<MonthSortKey>,
): T[] {
  return sortItems(rows, choice, {
    mes: { compare: (a: T, b: T) => a.competence.localeCompare(b.competence) },
    pagar: byNumber((r: T) => r.payTotalCents),
    receber: byNumber((r: T) => r.recvTotalCents),
    saldo: byNumber((r: T) => r.recvTotalCents - r.payTotalCents),
  })
}

/* ---------- Cadastros ---------- */

export type NameSortKey = 'ordem' | 'nome'

export const NAME_SORTS: readonly SortOption<NameSortKey>[] = [
  { key: 'ordem', label: 'Ordem de cadastro', dir: 'asc', directional: false },
  { key: 'nome', label: 'Nome', dir: 'asc' },
]
export const NAME_SORT_DEFAULT = choiceOf(NAME_SORTS[0])

/** Categorias, formas de pagamento e fornecedores. */
export function sortNamesBy<T extends { label: string }>(items: readonly T[], choice: SortChoice<NameSortKey>): T[] {
  return sortItems(items, choice, {
    ordem: { compare: () => 0 },
    nome: byText((i: T) => i.label),
  })
}

export type TemplateSortKey = 'ordem' | 'nome' | 'valor' | 'dia'

export const TEMPLATE_SORTS: readonly SortOption<TemplateSortKey>[] = [
  { key: 'ordem', label: 'Ordem de cadastro', dir: 'asc', directional: false },
  { key: 'nome', label: 'Nome', dir: 'asc' },
  { key: 'valor', label: 'Valor', dir: 'desc' },
  { key: 'dia', label: 'Dia do vencimento', dir: 'asc' },
]
export const TEMPLATE_SORT_DEFAULT = choiceOf(TEMPLATE_SORTS[0])

/** Atalhos sem valor ou sem dia (campo em branco) ficam no fim quando se ordena por esse campo. */
export function sortTemplatesBy<T extends { name: string; amountCents: number; dueDay: number | null }>(
  items: readonly T[],
  choice: SortChoice<TemplateSortKey>,
): T[] {
  return sortItems(items, choice, {
    ordem: { compare: () => 0 },
    nome: byText((t: T) => t.name),
    valor: byNumber((t: T) => t.amountCents, (t) => t.amountCents <= 0),
    dia: byNumber((t: T) => t.dueDay ?? 0, (t) => t.dueDay === null),
  })
}
