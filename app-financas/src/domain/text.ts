/** "Débito Automático" -> "debitoautomatico". Serve para comparar cabeçalhos, nomes e opções sem se importar com acento, caixa ou pontuação. */
export function simplify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
