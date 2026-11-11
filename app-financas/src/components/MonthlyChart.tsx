import type { KeyboardEvent } from 'react'
import { useMoney, usePrivacy } from '../data/privacy'
import { compactBRL, monthAbbr, niceCeil, type MonthReport } from '../domain/reports'

const W = 360
const H = 188
const LEFT = 64
const RIGHT = 6
const TOP = 10
const BOTTOM = 24
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = H - TOP - BOTTOM
const ROUND = 4

/** Barra com os dois cantos de cima arredondados (a ponta do dado) e a base reta, ancorada no eixo. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(ROUND, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

interface Props {
  rows: MonthReport[]
  selected: string | null
  onSelect: (competence: string | null) => void
}

/**
 * Barras agrupadas por mês: o que sai (A pagar) e o que entra (A receber), no mesmo eixo.
 * Cada mês é um botão (toque ou teclado) que mostra os valores logo abaixo.
 */
export function MonthlyChart({ rows, selected, onSelect }: Props) {
  const money = useMoney()
  const { hidden } = usePrivacy()
  const top = niceCeil(Math.max(0, ...rows.flatMap((r) => [r.payTotalCents, r.recvTotalCents])))
  const y = (cents: number) => TOP + PLOT_H - (cents / top) * PLOT_H
  const groupW = PLOT_W / rows.length
  const barW = Math.max(4, Math.min(22, Math.floor((groupW - 8) / 2) - 1))
  const ticks = [0, top / 2, top]

  function onKey(ev: KeyboardEvent, competence: string) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      onSelect(selected === competence ? null : competence)
    }
  }

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Gráfico de barras por mês: contas a pagar e valores a receber" preserveAspectRatio="xMidYMid meet">
      {ticks.map((t) => (
        <g key={t}>
          <line className="chart-grid" x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} />
          <text className="chart-tick" x={LEFT - 6} y={y(t) + 3.5} textAnchor="end">
            {hidden ? '••••' : compactBRL(t)}
          </text>
        </g>
      ))}
      {rows.map((r, k) => {
        const x0 = LEFT + k * groupW
        const cx = x0 + groupW / 2
        const payH = r.payTotalCents > 0 ? Math.max(2, PLOT_H - (y(r.payTotalCents) - TOP)) : 0
        const recvH = r.recvTotalCents > 0 ? Math.max(2, PLOT_H - (y(r.recvTotalCents) - TOP)) : 0
        const base = TOP + PLOT_H
        const isSelected = selected === r.competence
        const label = `${monthAbbr(r.competence)}${r.projected ? ', previsto' : ''}: a pagar ${money(r.payTotalCents)}, a receber ${money(r.recvTotalCents)}`
        return (
          <g
            key={r.competence}
            className={isSelected ? 'chart-group selected' : 'chart-group'}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={label}
            onClick={() => onSelect(isSelected ? null : r.competence)}
            onKeyDown={(ev) => onKey(ev, r.competence)}
          >
            <rect className="chart-hit" x={x0 + 1} y={TOP - 4} width={groupW - 2} height={PLOT_H + BOTTOM + 4} rx="6" />
            {payH > 0 && <path className={r.projected ? 'bar-pay projected' : 'bar-pay'} d={barPath(cx - barW - 1, base - payH, barW, payH)} />}
            {recvH > 0 && <path className={r.projected ? 'bar-recv projected' : 'bar-recv'} d={barPath(cx + 1, base - recvH, barW, recvH)} />}
            <text className="chart-month" x={cx} y={H - 7} textAnchor="middle">
              {monthAbbr(r.competence)}
              {r.projected ? '*' : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
