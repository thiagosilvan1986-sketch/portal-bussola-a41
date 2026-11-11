import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useMoney, usePrivacy } from '../data/privacy'
import { compactBRL, cumulativeSeries, monthAbbr, niceCeil, type MonthReport, type Scope } from '../domain/reports'

export type ChartMode = 'barras' | 'acumulado'

const W = 360
const H = 196
const LEFT = 64
const RIGHT = 8
const TOP = 12
const BOTTOM = 24
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = H - TOP - BOTTOM
const ROUND = 4

/** Barra com os dois cantos de cima arredondados (a ponta do dado) e a base reta, ancorada no eixo. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(ROUND, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/** Eixo vertical: de `lo` a `hi`, com o zero dentro quando há valores negativos. */
function axisOf(values: number[]): { lo: number; hi: number; ticks: number[] } {
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const hi = max > 0 ? niceCeil(max) : 0
  const lo = min < 0 ? -niceCeil(-min) : 0
  if (hi === 0 && lo === 0) return { lo: 0, hi: 10_000, ticks: [0, 5_000, 10_000] }
  if (lo === 0) return { lo, hi, ticks: [0, hi / 2, hi] }
  if (hi === 0) return { lo, hi, ticks: [lo, lo / 2, 0] }
  return { lo, hi, ticks: [lo, 0, hi] }
}

interface Props {
  rows: MonthReport[]
  scope: Scope
  mode: ChartMode
  selected: string | null
  onSelect: (competence: string | null) => void
  /** Muda quando o gráfico deve animar de novo (outro período, filtro ou tipo). */
  animKey: string
  /** Nome do que sai: "A pagar" (padrão) ou "Gasto real" na visão que desconta os reembolsos. */
  payLabel?: string
}

/**
 * Meses lado a lado: barras (o que sai e o que entra) ou linha acumulada.
 * Arrastar o dedo (ou passar o mouse) mostra os valores do mês sob o ponteiro; tocar fixa o mês.
 * Cada mês também é um botão pelo teclado.
 */
export function MonthlyChart({ rows, scope, mode, selected, onSelect, animKey, payLabel = 'A pagar' }: Props) {
  const money = useMoney()
  const { hidden } = usePrivacy()
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)
  const [hover, setHover] = useState<number | null>(null)

  const showPay = scope !== 'receber'
  const showRecv = scope !== 'pagar'
  const acc = cumulativeSeries(rows, scope)
  const values = mode === 'barras' ? rows.flatMap((r) => [showPay ? r.payTotalCents : 0, showRecv ? r.recvTotalCents : 0]) : acc
  const { lo, hi, ticks } = axisOf(values)
  const y = (cents: number) => TOP + PLOT_H - ((cents - lo) / (hi - lo)) * PLOT_H
  const zeroY = y(0)
  const groupW = PLOT_W / rows.length
  const slots = showPay && showRecv ? 2 : 1
  const barW = Math.max(4, Math.min(22, Math.floor((groupW - 8) / slots) - 1))
  const cx = (k: number) => LEFT + k * groupW + groupW / 2

  const selectedIndex = rows.findIndex((r) => r.competence === selected)
  const activeIndex = hover ?? (selectedIndex >= 0 ? selectedIndex : null)

  function indexAt(ev: PointerEvent): number | null {
    const box = wrap.current?.getBoundingClientRect()
    if (!box || box.width === 0) return null
    const x = ((ev.clientX - box.left) / box.width) * W - LEFT
    return Math.max(0, Math.min(rows.length - 1, Math.floor(x / groupW)))
  }
  function onMove(ev: PointerEvent) {
    const k = indexAt(ev)
    if (k === null) return
    if (ev.pointerType === 'touch' && k !== hover) dragged.current = true
    setHover(k)
  }
  function onLeave(ev: PointerEvent) {
    if (ev.pointerType === 'touch') return
    setHover(null)
  }
  function onUp(ev: PointerEvent) {
    // Soltar o dedo depois de arrastar fixa o mês onde parou (um toque simples é tratado pelo clique do mês).
    if (ev.pointerType === 'touch' && dragged.current && hover !== null) onSelect(rows[hover].competence)
    dragged.current = false
    if (ev.pointerType === 'touch') setHover(null)
  }
  function onKey(ev: KeyboardEvent, competence: string) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      onSelect(selected === competence ? null : competence)
    }
  }

  function labelOf(r: MonthReport, k: number): string {
    const head = `${monthAbbr(r.competence)}${r.projected ? ', previsto' : ''}`
    if (mode === 'acumulado') return `${head}: acumulado ${acc[k] < 0 ? 'menos ' : ''}${money(Math.abs(acc[k]))}`
    if (scope === 'pagar') return `${head}: ${payLabel.toLowerCase()} ${money(r.payTotalCents)}`
    if (scope === 'receber') return `${head}: a receber ${money(r.recvTotalCents)}`
    return `${head}: ${payLabel.toLowerCase()} ${money(r.payTotalCents)}, a receber ${money(r.recvTotalCents)}`
  }

  const lineColor = scope === 'pagar' ? 'var(--pay)' : scope === 'receber' ? 'var(--recv)' : 'var(--muted)'
  const points = rows.map((_, k) => `${cx(k)},${y(acc[k])}`)
  const area = `M${cx(0)},${zeroY} L${points.join(' L')} L${cx(rows.length - 1)},${zeroY} Z`
  const tip = hover !== null ? rows[hover] : null
  const tipLeft = hover === null ? 0 : Math.max(24, Math.min(76, (cx(hover) / W) * 100))

  return (
    <div className="chart-wrap" ref={wrap}>
      <svg
        key={animKey}
        className={`chart-svg chart-${mode}`}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={mode === 'barras' ? 'Gráfico de barras por mês' : 'Gráfico de linha com o valor acumulado mês a mês'}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerUp={onUp}
        onPointerCancel={() => {
          dragged.current = false
          setHover(null)
        }}
      >
        <defs>
          <clipPath id={`${uid}-above`}>
            <rect x={LEFT} y={0} width={PLOT_W + RIGHT} height={Math.max(0, zeroY)} />
          </clipPath>
          <clipPath id={`${uid}-below`}>
            <rect x={LEFT} y={zeroY} width={PLOT_W + RIGHT} height={Math.max(0, H - zeroY)} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 && lo < 0 ? 'chart-grid chart-zero' : 'chart-grid'} x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={LEFT - 6} y={y(t) + 3.5} textAnchor="end">
              {hidden ? '••••' : compactBRL(t)}
            </text>
          </g>
        ))}

        {mode === 'acumulado' && (
          <g className="line-layer">
            {scope === 'tudo' ? (
              <>
                <path d={area} className="area-pos" clipPath={`url(#${uid}-above)`} />
                <path d={area} className="area-neg" clipPath={`url(#${uid}-below)`} />
              </>
            ) : (
              <path d={area} fill={lineColor} fillOpacity="0.1" />
            )}
            <polyline className="chart-line" points={points.join(' ')} stroke={lineColor} />
          </g>
        )}

        {rows.map((r, k) => {
          const x0 = LEFT + k * groupW
          const isSelected = selected === r.competence
          const payH = showPay && r.payTotalCents > 0 ? Math.max(2, zeroY - y(r.payTotalCents)) : 0
          const recvH = showRecv && r.recvTotalCents > 0 ? Math.max(2, zeroY - y(r.recvTotalCents)) : 0
          const delay = { animationDelay: `${k * 40}ms` }
          const neg = acc[k] < 0
          return (
            <g
              key={r.competence}
              className={`chart-group${isSelected ? ' selected' : ''}${hover === k ? ' hovered' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={labelOf(r, k)}
              onClick={() => onSelect(isSelected ? null : r.competence)}
              onKeyDown={(ev) => onKey(ev, r.competence)}
            >
              <rect className="chart-hit" x={x0 + 1} y={TOP - 4} width={groupW - 2} height={PLOT_H + BOTTOM + 4} rx="6" />
              {mode === 'barras' && (
                <>
                  {payH > 0 && (
                    <path
                      className={r.projected ? 'bar-pay bar-grow projected' : 'bar-pay bar-grow'}
                      style={delay}
                      d={barPath(slots === 2 ? cx(k) - barW - 1 : cx(k) - barW / 2, zeroY - payH, barW, payH)}
                    />
                  )}
                  {recvH > 0 && (
                    <path
                      className={r.projected ? 'bar-recv bar-grow projected' : 'bar-recv bar-grow'}
                      style={delay}
                      d={barPath(slots === 2 ? cx(k) + 1 : cx(k) - barW / 2, zeroY - recvH, barW, recvH)}
                    />
                  )}
                </>
              )}
              {mode === 'acumulado' &&
                (scope === 'tudo' && neg ? (
                  // Falta dinheiro: losango (a forma também diz "falta", não só a cor).
                  <rect
                    className="dot-neg"
                    x={cx(k) - 4}
                    y={y(acc[k]) - 4}
                    width={8}
                    height={8}
                    transform={`rotate(45 ${cx(k)} ${y(acc[k])})`}
                  />
                ) : (
                  <circle
                    className={scope === 'tudo' ? 'dot-pos' : scope === 'pagar' ? 'dot-pay' : 'dot-recv'}
                    cx={cx(k)}
                    cy={y(acc[k])}
                    r={4.5}
                  />
                ))}
              <text className="chart-month" x={cx(k)} y={H - 7} textAnchor="middle">
                {monthAbbr(r.competence)}
                {r.projected ? '*' : ''}
              </text>
            </g>
          )
        })}

        {activeIndex !== null && <line className="chart-guide" x1={cx(activeIndex)} x2={cx(activeIndex)} y1={TOP - 4} y2={TOP + PLOT_H} />}
      </svg>

      {tip && hover !== null && (
        <div className="chart-tip" style={{ left: `${tipLeft}%` }} aria-hidden="true">
          <strong>
            {monthAbbr(tip.competence)}
            {tip.projected ? ' (previsto)' : ''}
          </strong>
          {mode === 'acumulado' ? (
            <span className="tip-row">
              {scope === 'tudo' ? (acc[hover] < 0 ? '▼ Falta ' : acc[hover] > 0 ? '▲ Sobra ' : '＝ ') : 'Acumulado '}
              <strong>{money(Math.abs(acc[hover]))}</strong>
            </span>
          ) : (
            <>
              {showPay && (
                <span className="tip-row">
                  <i className="tip-key key-pay" /> {payLabel} <strong>{money(tip.payTotalCents)}</strong>
                </span>
              )}
              {showRecv && (
                <span className="tip-row">
                  <i className="tip-key key-recv" /> A receber <strong>{money(tip.recvTotalCents)}</strong>
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
