import type { KeyboardEvent } from 'react'
import { useMoney } from '../data/privacy'
import { layoutFlow } from '../domain/flowLayout'
import type { FlowModel, FlowNode } from '../domain/reports'

const W = 360
const LABEL_L = 92
const NODE_L = 96
const NODE_W = 8
const NODE_R = 216
const LABEL_R = 230
const PAD_T = 6
const MAX_CHARS = 20

function fillOf(n: FlowNode): string {
  if (n.kind === 'recv' || n.kind === 'surplus') return 'var(--recv)'
  if (n.kind === 'gap') return 'var(--danger)'
  return n.slot === null ? 'var(--cat-other)' : `var(--cat-${n.slot + 1})`
}

function short(text: string): string {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text
}

interface Props {
  model: FlowModel
  /** Fatia em destaque (nome da categoria ou "Outras categorias"). */
  active: string | null
  onSelect: (category: string | null) => void
  animKey: string
}

/**
 * Fluxo do dinheiro: o que entra à esquerda, para onde vai à direita (categorias e sobra).
 * Quando falta dinheiro, a falta aparece como origem em vermelho, com o símbolo ▼.
 * Tocar numa categoria a escolhe nos filtros.
 */
export function FlowChart({ model, active, onSelect, animKey }: Props) {
  const money = useMoney()
  const layout = layoutFlow(model)
  const height = layout.height + PAD_T * 2
  const nodeOf = (key: string, list: FlowNode[]) => list.find((n) => n.key === key)!
  const xl = NODE_L + NODE_W
  const xm = (xl + NODE_R) / 2
  const sourceNode = (key: string) => nodeOf(key, model.sources)
  const payTotal = model.targets.filter((t) => t.kind === 'category').reduce((acc, t) => acc + t.cents, 0)

  function onKey(ev: KeyboardEvent, category: string) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      onSelect(active === category ? null : category)
    }
  }

  return (
    <svg key={animKey} className="chart-svg flow-svg" viewBox={`0 0 ${W} ${height}`} role="group" aria-label="Fluxo do dinheiro: do que entra para onde vai" preserveAspectRatio="xMidYMid meet">
      <g transform={`translate(0 ${PAD_T})`}>
        {layout.links.map((l, k) => {
          const from = sourceNode(l.from)
          const d = `M${xl},${l.y0} C${xm},${l.y0} ${xm},${l.y1} ${NODE_R},${l.y1} L${NODE_R},${l.y1 + l.h} C${xm},${l.y1 + l.h} ${xm},${l.y0 + l.h} ${xl},${l.y0 + l.h} Z`
          return <path key={`${l.from}-${l.to}-${k}`} className={`flow-link flow-${from.kind}`} d={d} />
        })}

        {layout.sources.map((p) => {
          const n = sourceNode(p.key)
          return (
            <g key={n.key}>
              <rect className="flow-node" x={NODE_L} y={p.y} width={NODE_W} height={p.h} rx={2} fill={fillOf(n)} />
              <text className="flow-name" x={LABEL_L} y={p.labelY - 2} textAnchor="end">
                {n.kind === 'gap' ? '▼ Falta' : n.label}
              </text>
              <text className="flow-value" x={LABEL_L} y={p.labelY + 11} textAnchor="end">
                {money(n.cents)}
              </text>
            </g>
          )
        })}

        {layout.targets.map((p) => {
          const n = nodeOf(p.key, model.targets)
          const isCategory = n.kind === 'category'
          const isActive = isCategory && active !== null && (active === n.label || n.members.includes(active))
          const dimmed = active !== null && isCategory && !isActive
          const share = isCategory && payTotal > 0 ? Math.round((n.cents / payTotal) * 100) : null
          const label = `${n.kind === 'surplus' ? 'Sobra' : n.label}: ${money(n.cents)}${share !== null ? `, ${share}% do que sai` : ''}`
          const body = (
            <>
              <rect className="flow-node" x={NODE_R} y={p.y} width={NODE_W} height={p.h} rx={2} fill={fillOf(n)} />
              <text className="flow-name" x={LABEL_R} y={p.labelY - 2}>
                {n.kind === 'surplus' ? '▲ Sobra' : short(n.label)}
              </text>
              <text className="flow-value" x={LABEL_R} y={p.labelY + 11}>
                {money(n.cents)}
                {share !== null ? ` · ${share}%` : ''}
              </text>
            </>
          )
          if (!isCategory) return <g key={n.key}>{body}</g>
          return (
            <g
              key={n.key}
              className={`flow-target${isActive ? ' active' : ''}${dimmed ? ' dim' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={label}
              onClick={() => onSelect(active === n.label ? null : n.label)}
              onKeyDown={(ev) => onKey(ev, n.label)}
            >
              <rect className="chart-hit" x={NODE_R - 6} y={p.labelY - 16} width={W - NODE_R + 6} height={30} rx={6} />
              {body}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

