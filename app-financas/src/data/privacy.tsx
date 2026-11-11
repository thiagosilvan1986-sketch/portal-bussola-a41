import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { formatBRL } from '../domain/money'

const KEY = 'contas-em-dia:ocultar-valores'

/** O que aparece no lugar de um valor em reais quando o olhinho está fechado. */
export const HIDDEN_MONEY = 'R$ ••••'

function readHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function writeHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // modo privativo ou armazenamento bloqueado: vale só até fechar o app
  }
}

interface PrivacyState {
  hidden: boolean
  toggle: () => void
}

// Sem o provedor (nos testes de telas isoladas), os valores aparecem normalmente.
const PrivacyContext = createContext<PrivacyState>({ hidden: false, toggle: () => undefined })

/** Guarda a escolha de ocultar os valores, no aparelho, para quem usa o app perto de outras pessoas. */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readHidden)
  const toggle = useCallback(() => {
    setHidden((current) => {
      writeHidden(!current)
      return !current
    })
  }, [])
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

export function usePrivacy(): PrivacyState {
  return useContext(PrivacyContext)
}

/** Formata um valor em reais para exibição, ou o marcador se os valores estiverem ocultos. */
export function useMoney(): (cents: number) => string {
  const { hidden } = usePrivacy()
  return useCallback((cents: number) => (hidden ? HIDDEN_MONEY : formatBRL(cents)), [hidden])
}
