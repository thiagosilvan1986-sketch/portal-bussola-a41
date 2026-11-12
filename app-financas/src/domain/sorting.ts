/**
 * Ordenação das listas: o critério (nome, valor, vencimento…) e o sentido (crescente ou decrescente).
 * Aqui ficam só as regras gerais; os critérios de cada tela estão em listSorts.ts.
 */

export type SortDir = 'asc' | 'desc'

export interface SortOption<K extends string = string> {
  key: K
  /** Texto que aparece na caixa "Ordenar por". */
  label: string
  /** Sentido ao escolher o critério: nome e data começam crescentes; valor começa do maior para o menor. */
  dir: SortDir
  /** false: o critério é uma regra fechada ("Situação", "Ordem de cadastro") e não tem botão de inverter. */
  directional?: boolean
}

export interface SortChoice<K extends string = string> {
  key: K
  dir: SortDir
}

export interface SortSpec<T> {
  /** Compara em ordem crescente. */
  compare: (a: T, b: T) => number
  /** Itens sem valor neste critério (dia em branco, sem próxima parcela) vão sempre para o fim, em qualquer sentido. */
  missing?: (x: T) => boolean
}

/** Nomes em português: ignora maiúsculas e acentos ("água" vem junto do "a"). */
export const textCompare = (a: string, b: string): number => a.localeCompare(b, 'pt-BR')

/** A escolha que vale ao tocar num critério: o sentido padrão dele. */
export const choiceOf = <K extends string>(option: SortOption<K>): SortChoice<K> => ({ key: option.key, dir: option.dir })

export const flipDir = (dir: SortDir): SortDir => (dir === 'asc' ? 'desc' : 'asc')

/**
 * Confere uma escolha (lida do aparelho, ou de uma lista de critérios que mudou) com os critérios de agora.
 * Se não servir mais, volta ao padrão da tela.
 */
export function resolveSort<K extends string>(
  options: readonly SortOption<K>[],
  stored: { key?: unknown; dir?: unknown } | null | undefined,
  fallback: SortChoice<K>,
): SortChoice<K> {
  const option = options.find((o) => o.key === stored?.key)
  if (!option) return fallback
  if (option.directional === false) return choiceOf(option)
  return { key: option.key, dir: stored?.dir === 'asc' || stored?.dir === 'desc' ? stored.dir : option.dir }
}

/**
 * Ordena pelo critério escolhido. A ordenação é estável: o que empata fica na ordem em que a lista já vinha,
 * então a ordem de antes serve de desempate. `group` põe grupos inteiros antes de outros (contas ativas antes
 * das arquivadas), em qualquer critério e sentido.
 */
export function sortItems<T, K extends string>(
  items: readonly T[],
  choice: SortChoice<K>,
  specs: Record<K, SortSpec<T>>,
  group?: (x: T) => number,
): T[] {
  const spec = specs[choice.key]
  const sign = choice.dir === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    if (group) {
      const g = group(a) - group(b)
      if (g !== 0) return g
    }
    const ma = spec.missing?.(a) ?? false
    const mb = spec.missing?.(b) ?? false
    if (ma !== mb) return ma ? 1 : -1
    if (ma) return 0
    return sign * spec.compare(a, b)
  })
}
