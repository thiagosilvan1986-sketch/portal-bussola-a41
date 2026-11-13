import { useState } from 'react'
import { useMoney } from '../data/privacy'
import { heatLevel, type DueDay, type DueItem } from '../domain/reports'

interface Props {
  days: DueDay[]
  /** pagar = azul; receber = verde. */
  tone: 'pagar' | 'receber'
  /** Período de mais de um mês: cada vencimento mostra a data (o mesmo dia aparece em meses diferentes). */
  multiMonth?: boolean
  /** Toque numa conta (ou parcela) do mapa. Sem isto, as linhas são só texto. */
  onOpen?: (item: DueItem) => void
}

/**
 * A situação do pagamento em palavras e ícone (a cor sozinha não basta): Paga, Parcial, Atrasada ou Pendente.
 * No que se recebe, "Paga" vira "Recebida". Mês sem lançamento é "Prevista": ainda não há o que pagar.
 */
export function pendency(item: DueItem, tone: 'pagar' | 'receber'): { cls: string; icon: string; label: string } {
  if (item.projected) return { cls: 'chip-prevista', icon: '○', label: 'Prevista' }
  switch (item.status) {
    case 'paga':
      return { cls: 'chip-paga', icon: '✓', label: tone === 'receber' ? 'Recebida' : 'Paga' }
    case 'parcial':
      return { cls: 'chip-parcial', icon: '◐', label: 'Parcial' }
    case 'atrasada':
      return { cls: 'chip-atrasada', icon: '⚠', label: 'Atrasada' }
    default:
      return { cls: 'chip-vence_em_breve', icon: '◔', label: 'Pendente' }
  }
}

type ListMode = 'detalhado' | 'consolidado'

/** "18/11" */
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const LEVELS = [1, 2, 3, 4, 5]

function contas(count: number): string {
  return count === 1 ? '1 vencimento' : `${count} vencimentos`
}

/**
 * Os dias 1 a 31 em grade: quanto mais escuro, mais dinheiro vence naquele dia (somando o período).
 * Toque num dia para ver o valor e as contas dele; a lista abaixo traz os mesmos números sem depender da cor,
 * conta por conta (Detalhado) ou só o total de cada dia (Consolidado).
 */
export function DueHeatmap({ days, tone, multiMonth = false, onOpen }: Props) {
  const money = useMoney()
  const [picked, setPicked] = useState<number | null>(null)
  const [mode, setMode] = useState<ListMode>('detalhado')
  const max = Math.max(0, ...days.map((d) => d.totalCents))
  const busiest = days.find((d) => d.totalCents === max && max > 0) ?? null
  const withDue = days.filter((d) => d.count > 0)
  const current = picked !== null ? days[picked - 1] : null

  function row(i: DueItem, k: number) {
    const p = pendency(i, tone)
    const text = (
      <>
        <span className="heat-item-main">
          <span>
            {multiMonth && <span className="muted">{shortDate(i.dueDate)} · </span>}
            {i.name}
          </span>
          <strong>{money(i.cents)}</strong>
        </span>
        <span className="heat-item-sub">
          <span className={`chip ${p.cls} status-chip`}>
            <span aria-hidden="true">{p.icon} </span>
            {p.label}
          </span>
          {onOpen && <span className="heat-open">Ver detalhes ›</span>}
        </span>
      </>
    )
    return (
      <li key={k}>
        {onOpen ? (
          <button type="button" className="heat-item" aria-label={`${i.name}, ${money(i.cents)}, ${p.label}. Ver detalhes`} onClick={() => onOpen(i)}>
            {text}
          </button>
        ) : (
          <div className="heat-item">{text}</div>
        )}
      </li>
    )
  }

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
      {current && current.items.length > 0 && (
        <ul className="heat-items" aria-label={`Vencimentos do dia ${current.day}`}>
          {current.items.map(row)}
        </ul>
      )}

      {withDue.length > 0 && (
        <details className="heat-list">
          <summary>Ver como lista</summary>
          <div className="segmented segmented-small" role="group" aria-label="Como mostrar a lista">
            {(['detalhado', 'consolidado'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'detalhado' ? 'Detalhado' : 'Consolidado'}
              </button>
            ))}
          </div>
          {mode === 'consolidado' ? (
            <ul>
              {withDue.map((d) => (
                <li key={d.day}>
                  <span>Dia {d.day}</span>
                  <span className="muted">{contas(d.count)}</span>
                  <strong>{money(d.totalCents)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="heat-detail">
              {withDue.map((d) => (
                <li key={d.day}>
                  <div className="heat-day-head">
                    <span>Dia {d.day}</span>
                    <strong>{money(d.totalCents)}</strong>
                  </div>
                  <ul className="heat-items">
                    {d.items.map(row)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  )
}
