const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 23840 -> "R$ 238,40" */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

/**
 * Converte texto digitado em centavos, sem passar por ponto flutuante.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 238", "238,4".
 * Retorna null se for inválido ou negativo.
 */
export function parseBRLToCents(input: string): number | null {
  let s = input.replace(/R\$/gi, '').replace(/\s/g, '')
  if (s === '' || /[^0-9.,]/.test(s)) return null

  if (s.includes(',')) {
    // vírgula é o separador decimal; pontos são milhar
    if (s.split(',').length > 2) return null
    s = s.replace(/\./g, '')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" ou "1.234.567": milhar no padrão brasileiro
    s = s.replace(/\./g, '')
  } else if ((s.match(/\./g) ?? []).length > 1) {
    return null
  }

  const [intPart, fracRaw = ''] = s.split(/[,.]/)
  if (!/^\d+$/.test(intPart || '0') || (fracRaw !== '' && !/^\d+$/.test(fracRaw))) return null
  if (fracRaw.length > 2) return null

  const cents = Number(intPart || '0') * 100 + Number(fracRaw.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** Texto para preencher um campo de valor: 23840 -> "238,40". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

const MAX_MASK_DIGITS = 11 // até R$ 999.999.999,99

/**
 * Máscara de valor em reais: só os números contam e a vírgula entra sozinha, preenchendo da direita para a esquerda.
 * "9606" -> "96,06"; "123456" -> "1.234,56". `previous` é o texto antes da edição: serve para saber se a pessoa
 * está apagando (apagar até zerar deixa o campo vazio; digitar um zero mostra "0,00").
 */
export function maskMoney(raw: string, previous = ''): string {
  const allDigits = raw.replace(/\D/g, '').slice(0, MAX_MASK_DIGITS)
  const digits = allDigits.replace(/^0+/, '')
  if (digits === '') return allDigits !== '' && raw.length >= previous.length ? '0,00' : ''
  const padded = digits.padStart(3, '0')
  const int = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${int},${padded.slice(-2)}`
}

/** Valor em centavos já com a máscara: 123456 -> "1.234,56". */
export function centsToMasked(cents: number): string {
  return maskMoney(String(Math.round(cents)).padStart(3, '0'), '')
}
