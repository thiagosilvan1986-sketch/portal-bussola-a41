import { useCallback, useMemo, useState } from 'react'
import { resolveSort, type SortChoice, type SortOption } from '../domain/sorting'

/**
 * A ordem escolhida em cada lista fica só neste aparelho (localStorage), tela por tela. Se o navegador bloquear
 * o armazenamento, a lista volta à ordem padrão a cada visita; o app segue funcionando.
 */
const PREFIX = 'contas-em-dia:ordem:'

type Stored = { key: string; dir: string }

function read(screen: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + screen)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const { key, dir } = parsed as Record<string, unknown>
      if (typeof key === 'string' && typeof dir === 'string') return { key, dir }
    }
    return null
  } catch {
    return null
  }
}

function write(screen: string, choice: SortChoice): void {
  try {
    window.localStorage.setItem(PREFIX + screen, JSON.stringify({ key: choice.key, dir: choice.dir }))
  } catch {
    /* sem armazenamento: a escolha vale até sair da tela */
  }
}

/**
 * A ordem de uma lista: lê a escolha guardada, confere com os critérios que a tela oferece agora e, se não servir
 * mais (ou se nunca foi escolhida), usa o padrão. O valor guardado não é apagado quando o critério some de vista
 * (por exemplo, a coluna "A receber" fora do filtro): ele volta a valer quando o critério voltar.
 */
export function useSortChoice<K extends string>(
  screen: string,
  options: readonly SortOption<K>[],
  fallback: SortChoice<K>,
): readonly [SortChoice<K>, (choice: SortChoice<K>) => void] {
  const [stored, setStored] = useState<Stored | null>(() => read(screen))
  const choice = useMemo(() => resolveSort(options, stored, fallback), [options, stored, fallback])
  const set = useCallback(
    (next: SortChoice<K>) => {
      setStored({ key: next.key, dir: next.dir })
      write(screen, next)
    },
    [screen],
  )
  return [choice, set] as const
}
