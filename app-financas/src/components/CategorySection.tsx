import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMoney } from '../data/privacy'
import { useSortChoice } from '../data/sortPrefs'
import { amountDue, displayStatus } from '../domain/entries'
import { formatDateBR } from '../domain/dates'
import { ENTRY_SORTS, ENTRY_SORT_DEFAULT, SLICE_SORTS, SLICE_SORT_DEFAULT, sortEntriesBy, sortSlicesBy } from '../domain/listSorts'
import {
  OTHER_CATEGORIES,
  categoryEntries,
  categoryTrend,
  monthAbbr,
  sliceOf,
  type CategorySlice,
} from '../domain/reports'
import type { Competence, Entry, IsoDate } from '../domain/types'
import { SortControl } from './SortControl'
import { StatusChip } from './StatusChip'

const SIZE = 168
const R = 62
const STROKE = 22
const GAP = 2
const CIRC = 2 * Math.PI * R

/** Cor da fatia: a posição na paleta vem do tamanho no período; "Outras categorias" é cinza. */
export const sliceColor = (slot: number | null) => (slot === null ? 'var(--cat-other)' : `var(--cat-${slot + 1})`)

interface Props {
  slices: CategorySlice[]
  /** Todos os lançamentos do período (sem filtro de categoria): a escolha mora aqui. */
  entries: Entry[]
  months: Competence[]
  today: IsoDate
  /** Categoria escolhida (nome real ou "Outras categorias"). */
  category: string | null
  onSelect: (category: string | null) => void
  /** Limpar a escolha não leva a lugar nenhum: usa o filtro direto. */
  onFilter: (category: string | null) => void
  animKey: string
  /** Texto do centro da rosquinha: "Total a pagar" (padrão) ou "Gasto real" na visão que desconta os reembolsos. */
  totalLabel?: string
}

/**
 * Para onde vai o dinheiro: rosquinha + lista em ordem de tamanho. Tocar numa categoria a escolhe nos filtros
 * e abre as contas dela, com a evolução mês a mês.
 */
export function CategorySection({ slices, entries, months, today, category, onSelect, onFilter, animKey, totalLabel = 'Total a pagar' }: Props) {
  const money = useMoney()
  const total = slices.reduce((acc, s) => acc + s.totalCents, 0)
  const active = sliceOf(slices, category)
  // Fatia sob o mouse (ou com o foco do teclado): o centro mostra o nome dela sem precisar clicar.
  const [hovered, setHovered] = useState<string | null>(null)
  const shown = (hovered ? slices.find((s) => s.category === hovered) : null) ?? active
  const members = category === null ? [] : category === OTHER_CATEGORIES ? (slices.find((s) => s.category === OTHER_CATEGORIES)?.members ?? []) : [category]
  const maxShare = Math.max(...slices.map((s) => s.totalCents), 1)
  // A ordem da lista é escolha da pessoa; a rosquinha e as cores seguem sempre o tamanho de cada categoria.
  const [sliceSort, setSliceSort] = useSortChoice('relatorio-categorias', SLICE_SORTS, SLICE_SORT_DEFAULT)
  const listed = sortSlicesBy(slices, sliceSort)

  // Cada fatia começa onde a anterior terminou.
  const lengths = slices.map((s) => (s.totalCents / total) * CIRC)
  const arcs = slices.map((s, i) => ({
    slice: s,
    draw: Math.max(0.5, lengths[i] - GAP),
    at: lengths.slice(0, i).reduce((a, b) => a + b, 0),
  }))

  function toggle(key: string) {
    if (category === key) onFilter(null)
    else onSelect(key)
  }

  return (
    <section className="card stack" aria-label="Contas a pagar por categoria">
      <h2>Para onde vai o dinheiro</h2>
      <p className="muted small">Toque numa categoria para ver as contas dela e a evolução mês a mês.</p>

      <div className="donut" key={animKey}>
        <svg className="donut-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Rosquinha das contas a pagar por categoria">
          {arcs.map(({ slice, draw, at }) => {
            const isActive = active?.category === slice.category
            const isHovered = hovered === slice.category
            const dim = active !== null && !isActive && !isHovered
            return (
              <circle
                key={slice.category}
                className={`donut-arc${isActive ? ' active' : ''}${isHovered ? ' hovered' : ''}${dim ? ' dim' : ''}`}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={sliceColor(slice.slot)}
                strokeWidth={isActive ? STROKE + 6 : isHovered ? STROKE + 4 : STROKE}
                strokeDasharray={`${draw} ${CIRC - draw}`}
                strokeDashoffset={-at}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                style={{ ['--draw' as string]: draw, ['--circ' as string]: CIRC }}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                aria-label={`${slice.category}: ${money(slice.totalCents)}, ${slice.share}% das contas a pagar`}
                onClick={() => toggle(slice.category)}
                onPointerEnter={(ev) => ev.pointerType === 'mouse' && setHovered(slice.category)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(slice.category)}
                onBlur={() => setHovered(null)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    toggle(slice.category)
                  }
                }}
              />
            )
          })}
        </svg>
        <div className="donut-center" aria-hidden="true">
          <span className="muted">{shown ? shown.category : totalLabel}</span>
          <strong>{money(shown ? shown.totalCents : total)}</strong>
          {shown && <span className="muted">{shown.share}% do total</span>}
        </div>
      </div>

      {slices.length > 1 && (
        <SortControl label="Ordenação das categorias" options={SLICE_SORTS} value={sliceSort} onChange={setSliceSort} />
      )}

      <ul className="cat-list">
        {listed.map((s) => {
          const isActive = active?.category === s.category
          return (
            <li key={s.category}>
              <button type="button" className={`cat-row${isActive ? ' active' : ''}`} aria-pressed={isActive} onClick={() => toggle(s.category)}>
                <span className="cat-line">
                  <span className="cat-name">
                    <i className="cat-swatch" style={{ background: sliceColor(s.slot) }} aria-hidden="true" />
                    {s.category}
                  </span>
                  <span>
                    <strong>{money(s.totalCents)}</strong> <span className="muted">· {s.share}%</span>
                  </span>
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${Math.max((s.totalCents / maxShare) * 100, 2)}%`, background: sliceColor(s.slot) }} />
                </span>
                {isActive && <span className="cat-hint muted">Toque para limpar a escolha</span>}
              </button>
            </li>
          )
        })}
      </ul>

      {category !== null && members.length > 0 && (
        <CategoryDetail
          title={category}
          color={sliceColor(active?.slot ?? null)}
          entries={entries}
          months={months}
          members={members}
          today={today}
          onClear={() => onFilter(null)}
        />
      )}
    </section>
  )
}

interface DetailProps {
  title: string
  color: string
  entries: Entry[]
  months: Competence[]
  members: string[]
  today: IsoDate
  onClear: () => void
}

const TW = 360
const TH = 72
const TP = 8

function CategoryDetail({ title, color, entries, months, members, today, onClear }: DetailProps) {
  const money = useMoney()
  const [entrySort, setEntrySort] = useSortChoice('relatorio-contas-categoria', ENTRY_SORTS, ENTRY_SORT_DEFAULT)
  const list = sortEntriesBy(categoryEntries(entries, months, members), entrySort, amountDue)
  const trend = categoryTrend(entries, months, members)
  const max = Math.max(...trend, 1)
  const slot = (TW - TP * 2) / months.length
  const barW = Math.min(22, slot - 8)

  return (
    <div className="cat-detail" id="cat-detail" aria-label={`Contas de ${title}`} role="group">
      <div className="cat-detail-head">
        <h3>{title}</h3>
        <button type="button" className="link-btn" onClick={onClear}>
          Ver todas as categorias
        </button>
      </div>

      <svg className="trend-svg" viewBox={`0 0 ${TW} ${TH}`} role="img" aria-label={`Evolução mensal de ${title}; os valores estão na tabela logo abaixo`}>
        <line className="chart-grid" x1={TP} x2={TW - TP} y1={TH - 18} y2={TH - 18} />
        {months.map((c, k) => {
          const h = trend[k] > 0 ? Math.max(2, (trend[k] / max) * (TH - 30)) : 0
          const x = TP + k * slot + (slot - barW) / 2
          return (
            <g key={c}>
              {h > 0 && <rect className="trend-bar" x={x} y={TH - 18 - h} width={barW} height={h} rx={3} fill={color} />}
              <text className="chart-month" x={x + barW / 2} y={TH - 5} textAnchor="middle">
                {monthAbbr(c)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="table-wrap">
        <table className="report-table trend-table">
          <caption className="sr-only">Total a pagar de {title} em cada mês</caption>
          <thead>
            <tr>
              {months.map((c) => (
                <th key={c} scope="col">
                  {monthAbbr(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {trend.map((v, k) => (
                <td key={months[k]}>{money(v)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {list.length > 1 && (
        <SortControl label="Ordenação das contas da categoria" options={ENTRY_SORTS} value={entrySort} onChange={setEntrySort} />
      )}

      <ul className="list cat-bills">
        {list.map((e) => (
          <li key={e.id}>
            <Link className="debtor-row" to={`/contas/${e.billId}`}>
              <span className="debtor-name">
                {e.billName}
                <span className="muted small">
                  {members.length > 1 ? `${e.category} · ` : ''}vence {formatDateBR(e.dueDate)}
                </span>
                <StatusChip status={displayStatus(e, today)} />
              </span>
              <strong>{money(amountDue(e))}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
