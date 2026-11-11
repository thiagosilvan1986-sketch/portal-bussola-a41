import { useState } from 'react'
import { useMoney } from '../data/privacy'
import { heatLevel, type DueDay } from '../domain/reports'

interface Props {
  days: DueDay[]
  /** pagar = azul; receber = verde. */
  tone: 'pagar' | 'receber'
}

const LEVELS = [1, 2, 3, 4, 5]

function contas(count: number): string {
  return count === 1 ? '1 vencimento' : `${count} vencimentos`
}

/**
 * Os dias 1 a 31 em grade: quanto mais escuro, mais dinheiro vence naquele dia (somando o período).
 * Toque num dia para ver o valor; a lista abaixo traz os mesmos números sem depender da cor.
 */
export function DueHeatmap({ days, tone }: Props) {
  const money = useMoney()
  const [picked, setPicked] = useState<number | null>(null)
  const max = Math.max(0, ...days.map((d) => d.totalCents))
  const busiest = days.find((d) => d.totalCents === max && max > 0) ?? null
  const withDue = days.filter((d) => d.count > 0)
  const current = picked !== null ? days[picked - 1] : null

  return (
    <div className={`heatmap ${tone === 'pagar' ? 'heat-pay' : 'heat-recv'}`}>
      <div className="heat-grid" role="group" aria-label="Dias do mês">
        {days.map((d) => {
          const level = heatLevel(d.totalCents, max)
          return (
            <button
              key={d.day}
              type="button"
              className={`heat-cell lv-${level}${picked === d.day ? ' picked' : ''}`}
              aria-pressed={picked === d.day}
              aria-label={d.count > 0 ? `Dia ${d.day}: ${money(d.totalCents)}, ${contas(d.count)}` : `Dia ${d.day}: nada vence`}
              onClick={() => setPicked(picked === d.day ? null : d.day)}
            >
              {d.day}
            </button>
          )
        })}
      </div>

      <div className="heat-scale" aria-hidden="true">
        <span>Menos</span>
        {LEVELS.map((l) => (
          <i key={l} className={`heat-swatch lv-${l}`} />
        ))}
        <span>Mais</span>
      </div>

      <p className="chart-readout" aria-live="polite">
        {current ? (
          current.count > 0 ? (
            <>
              <strong>Dia {current.day}</strong>: {money(current.totalCents)} em {contas(current.count)}
            </>
          ) : (
            <>
              <strong>Dia {current.day}</strong>: nada vence.
            </>
          )
        ) : busiest ? (
          <>
            Dia mais carregado: <strong>dia {busiest.day}</strong> ({money(busiest.totalCents)}). Toque em um dia para ver os valores.
          </>
        ) : (
          <span className="muted">Nenhum vencimento neste período.</span>
        )}
      </p>

      {withDue.length > 0 && (
        <details className="heat-list">
          <summary>Ver como lista</summary>
          <ul>
            {withDue.map((d) => (
              <li key={d.day}>
                <span>Dia {d.day}</span>
                <span className="muted">{contas(d.count)}</span>
                <strong>{money(d.totalCents)}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
