import { useCallback, useState } from 'react'

/**
 * Tamanho da letra do app, guardado só neste aparelho (localStorage). A escolha muda o tamanho-base da página
 * (`<html data-font-size>`), e todo o resto do app, que é medido em `rem`, acompanha. Os tamanhos são percentuais
 * para continuar respeitando o tamanho de letra que a pessoa configurou no próprio celular.
 */
export type FontSize = 'pequena' | 'media' | 'grande'

export const FONT_SIZES: readonly { key: FontSize; label: string }[] = [
  { key: 'pequena', label: 'Pequena' },
  { key: 'media', label: 'Média' },
  { key: 'grande', label: 'Grande' },
]

export const DEFAULT_FONT_SIZE: FontSize = 'media'

const KEY = 'contas-em-dia:tamanho-letra'

const isFontSize = (v: unknown): v is FontSize => v === 'pequena' || v === 'media' || v === 'grande'

export function readFontSize(): FontSize {
  try {
    const raw = window.localStorage.getItem(KEY)
    return isFontSize(raw) ? raw : DEFAULT_FONT_SIZE
  } catch {
    return DEFAULT_FONT_SIZE
  }
}

/** Aplica o tamanho na página. Chamado antes de desenhar a primeira tela, para não piscar no tamanho errado. */
export function applyFontSize(size: FontSize): void {
  document.documentElement.dataset.fontSize = size
}

function writeFontSize(size: FontSize): void {
  try {
    window.localStorage.setItem(KEY, size)
  } catch {
    /* sem armazenamento: o tamanho vale até fechar o app */
  }
}

export function useFontSize(): readonly [FontSize, (size: FontSize) => void] {
  const [size, setSize] = useState<FontSize>(readFontSize)
  const choose = useCallback((next: FontSize) => {
    setSize(next)
    applyFontSize(next)
    writeFontSize(next)
  }, [])
  return [size, choose] as const
}
