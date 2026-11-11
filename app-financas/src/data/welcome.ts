/**
 * A apresentação da tela inicial aparece até a pessoa tocar em "Entendi".
 * A escolha fica só neste aparelho (localStorage); se o navegador bloquear, a apresentação volta a aparecer.
 */
const KEY = 'contas-em-dia:apresentacao-vista'

export function isWelcomeDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function dismissWelcome(): void {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    /* sem armazenamento: tudo bem, ela só volta a aparecer */
  }
}

export function resetWelcome(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nada a fazer */
  }
}
