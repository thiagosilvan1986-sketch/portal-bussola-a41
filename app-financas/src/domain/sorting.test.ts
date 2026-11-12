import { describe, expect, it } from 'vitest'
import { choiceOf, flipDir, resolveSort, sortItems, textCompare, type SortOption, type SortSpec } from './sorting'

type Row = { name: string; n: number | null }
type Key = 'nome' | 'numero'

const OPTIONS: SortOption<Key>[] = [
  { key: 'nome', label: 'Nome', dir: 'asc' },
  { key: 'numero', label: 'Número', dir: 'desc' },
]
const SPECS: Record<Key, SortSpec<Row>> = {
  nome: { compare: (a, b) => textCompare(a.name, b.name) },
  numero: { compare: (a, b) => (a.n ?? 0) - (b.n ?? 0), missing: (r) => r.n === null },
}
const names = (rows: Row[]) => rows.map((r) => r.name)

describe('textCompare', () => {
  it('ignora maiúsculas e acentos, como numa lista em português', () => {
    expect(['Banco', 'água', 'Abril', 'Zeca', 'ônibus'].sort(textCompare)).toEqual(['Abril', 'água', 'Banco', 'ônibus', 'Zeca'])
  })
})

describe('resolveSort', () => {
  const fallback = choiceOf(OPTIONS[0])

  it('aceita um critério e um sentido válidos', () => {
    expect(resolveSort(OPTIONS, { key: 'numero', dir: 'asc' }, fallback)).toEqual({ key: 'numero', dir: 'asc' })
  })

  it('volta ao padrão quando não há nada guardado ou o critério não existe mais', () => {
    expect(resolveSort(OPTIONS, null, fallback)).toEqual(fallback)
    expect(resolveSort(OPTIONS, undefined, fallback)).toEqual(fallback)
    expect(resolveSort(OPTIONS, { key: 'apagado', dir: 'asc' }, fallback)).toEqual(fallback)
    expect(resolveSort(OPTIONS, { key: 42, dir: 'asc' }, fallback)).toEqual(fallback)
  })

  it('com o sentido inválido, usa o sentido padrão do critério', () => {
    expect(resolveSort(OPTIONS, { key: 'numero', dir: 'sideways' }, fallback)).toEqual({ key: 'numero', dir: 'desc' })
    expect(resolveSort(OPTIONS, { key: 'nome' }, fallback)).toEqual({ key: 'nome', dir: 'asc' })
  })

  it('critério de regra fechada ignora o sentido guardado', () => {
    const closed: SortOption<'regra' | 'nome'>[] = [
      { key: 'regra', label: 'Regra', dir: 'asc', directional: false },
      { key: 'nome', label: 'Nome', dir: 'asc' },
    ]
    expect(resolveSort(closed, { key: 'regra', dir: 'desc' }, choiceOf(closed[1]))).toEqual({ key: 'regra', dir: 'asc' })
  })
})

describe('flipDir', () => {
  it('inverte o sentido', () => {
    expect(flipDir('asc')).toBe('desc')
    expect(flipDir('desc')).toBe('asc')
  })
})

describe('sortItems', () => {
  const rows: Row[] = [
    { name: 'Carla', n: 5 },
    { name: 'Ana', n: 9 },
    { name: 'Bia', n: 5 },
    { name: 'Davi', n: null },
  ]

  it('ordena de forma crescente e decrescente', () => {
    expect(names(sortItems(rows, { key: 'nome', dir: 'asc' }, SPECS))).toEqual(['Ana', 'Bia', 'Carla', 'Davi'])
    expect(names(sortItems(rows, { key: 'nome', dir: 'desc' }, SPECS))).toEqual(['Davi', 'Carla', 'Bia', 'Ana'])
  })

  it('o que empata fica na ordem em que a lista já vinha, nos dois sentidos', () => {
    // Carla e Bia empatam em 5: Carla vem antes na lista original.
    expect(names(sortItems(rows, { key: 'numero', dir: 'asc' }, SPECS))).toEqual(['Carla', 'Bia', 'Ana', 'Davi'])
    expect(names(sortItems(rows, { key: 'numero', dir: 'desc' }, SPECS))).toEqual(['Ana', 'Carla', 'Bia', 'Davi'])
  })

  it('quem não tem valor no critério vai para o fim, crescente ou decrescente', () => {
    expect(names(sortItems(rows, { key: 'numero', dir: 'asc' }, SPECS)).at(-1)).toBe('Davi')
    expect(names(sortItems(rows, { key: 'numero', dir: 'desc' }, SPECS)).at(-1)).toBe('Davi')
  })

  it('o grupo vem antes de qualquer critério e sentido', () => {
    const group = (r: Row) => (r.name === 'Ana' ? 1 : 0)
    expect(names(sortItems(rows, { key: 'nome', dir: 'asc' }, SPECS, group)).at(-1)).toBe('Ana')
    expect(names(sortItems(rows, { key: 'nome', dir: 'desc' }, SPECS, group)).at(-1)).toBe('Ana')
  })

  it('não mexe na lista original', () => {
    const copy = rows.map((r) => r.name)
    sortItems(rows, { key: 'nome', dir: 'desc' }, SPECS)
    expect(names(rows)).toEqual(copy)
  })
})
