/** "Débito Automático" -> "debitoautomatico". Serve para comparar cabeçalhos, nomes e opções sem se importar com acento, caixa ou pontuação. */
export function simplify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Ordem alfabética em português (sem diferenciar acento ou maiúscula). */
export function byName(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })
}

/**
 * Lista em ordem alfabética, com `last` (ex.: "Outros") sempre no fim: todas as listas do app aparecem assim.
 */
export function alphabetical<T>(items: readonly T[], name: (item: T) => string, last?: (item: T) => boolean): T[] {
  return [...items].sort((a, b) => {
    const la = last?.(a) ? 1 : 0
    const lb = last?.(b) ? 1 : 0
    return la - lb || byName(name(a), name(b))
  })
}
