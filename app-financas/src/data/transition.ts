import { flushSync } from 'react-dom'

/**
 * Roda a mudança de tela com a transição suave do navegador (View Transitions API),
 * quando existe e a pessoa não pediu para reduzir movimento. Sem isso, muda direto.
 */
export function withTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown }
  let reduce = false
  try {
    reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    reduce = false
  }
  if (typeof doc.startViewTransition !== 'function' || reduce) {
    update()
    return
  }
  doc.startViewTransition(() => {
    flushSync(update)
  })
}
