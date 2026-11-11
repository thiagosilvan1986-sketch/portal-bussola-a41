import { useMoney } from '../data/privacy'
import { percentChange } from '../domain/reports'

interface Props {
  now: number
  before: number
  /** Para quem lê, é bom subir ou descer? Pagar menos é bom; receber mais é bom. */
  goodWhen: 'up' | 'down'
  /** "trimestre anterior", "ano anterior"… */
  versus: string
  /** Em centavos (saldo, que pode ser negativo) ou em percentual (totais). */
  as?: 'percent' | 'money'
}

/** Comparação com o período anterior: seta, número e palavra (a cor sozinha não basta). Âmbar quando piora; verde quando melhora. */
export function Delta({ now, before, goodWhen, versus, as = 'percent' }: Props) {
  const money = useMoney()
  if (as === 'percent' && before === 0) return <span className="delta delta-none">Sem dados no {versus}</span>
  const diff = now - before
  if (diff === 0) {
    return (
      <span className="chip chip-prevista delta">
        <span aria-hidden="true">＝ </span>
        Igual ao {versus}
      </span>
    )
  }
  const up = diff > 0
  const better = (up && goodWhen === 'up') || (!up && goodWhen === 'down')
  const amount = as === 'money' ? money(Math.abs(diff)) : `${Math.abs(percentChange(now, before) ?? 0)}%`
  const word = as === 'money' ? (better ? 'melhor' : 'pior') : up ? 'a mais' : 'a menos'
  return (
    <span className={`chip delta ${better ? 'chip-paga' : 'chip-vence_em_breve'}`}>
      <span aria-hidden="true">{up ? '▲ ' : '▼ '}</span>
      {amount} {word} que o {versus}
    </span>
  )
}
