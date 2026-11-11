/**
 * A apresentação da tela inicial aparece uma única vez, na primeira entrada. Depois, a lista de
 * funcionalidades fica só na aba Sobre. O registro fica só neste aparelho (localStorage);
 * se o navegador bloquear, a apresentação volta a aparecer.
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
