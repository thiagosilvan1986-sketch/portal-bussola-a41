import type { ClipboardEvent, InputHTMLAttributes } from 'react'
import { centsToMasked, maskMoney, parseBRLToCents } from '../domain/money'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** Texto do campo (já com a máscara, como "1.234,56", ou vazio). */
  value: string
  onChange: (text: string) => void
}

/**
 * Campo de valor em reais com máscara: você digita só números e a vírgula entra sozinha
 * (9606 vira 96,06; 123456 vira 1.234,56). Colar "238,40" também funciona.
 * O texto continua sendo lido por `parseBRLToCents`, como antes.
 */
export function MoneyInput({ value, onChange, ...rest }: Props) {
  const shown = maskMoney(value, value)

  function onPaste(ev: ClipboardEvent<HTMLInputElement>) {
    const cents = parseBRLToCents(ev.clipboardData.getData('text'))
    if (cents === null) return // texto estranho: a máscara cuida só dos números
    ev.preventDefault()
    onChange(centsToMasked(cents))
  }

  return (
    <input
      {...rest}
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onChange={(e) => onChange(maskMoney(e.target.value, shown))}
      onPaste={onPaste}
    />
  )
}
