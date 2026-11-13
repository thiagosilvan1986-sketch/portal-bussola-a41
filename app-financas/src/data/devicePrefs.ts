import { useCallback, useState } from 'react'

/**
 * Uma escolha simples que fica neste aparelho (localStorage), como a ordem das listas: filtro da Início,
 * período do resumo de A receber. Sem armazenamento, vale o padrão a cada visita.
 */
const PREFIX = 'contas-em-dia:escolha:'

export function useDeviceChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(PREFIX + key)
      return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
    } catch {
      return fallback
    }
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        window.localStorage.setItem(PREFIX + key, v)
      } catch {
        /* sem armazenamento: vale até sair da tela */
      }
    },
    [key],
  )
  return [value, set]
}
