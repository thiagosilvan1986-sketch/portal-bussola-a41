import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { CategorySection } from '../components/CategorySection'
import { Delta } from '../components/Delta'
import { DueHeatmap } from '../components/DueHeatmap'
import { FlowChart } from '../components/FlowChart'
import { MonthlyChart, type ChartMode } from '../components/MonthlyChart'
import { SortControl } from '../components/SortControl'
import { Sparkline } from '../components/Sparkline'
import { useBills, useEntriesRange, usePeople, useReceivables, useToday } from '../data/hooks'
import { useMoney, usePrivacy } from '../data/privacy'
import { useSortChoice } from '../data/sortPrefs'
import { withTransition } from '../data/transition'
import { formatCompetence } from '../domain/dates'
import { netOfReimbursements } from '../domain/linked'
import { DEBTOR_SORTS, DEBTOR_SORT_DEFAULT, MONTH_SORT_DEFAULT, monthSorts, sortDebtorsBy, sortMonthsBy } from '../domain/listSorts'
import {
  OTHER_CATEGORIES,
  PERIOD_KINDS,
  PERIOD_LABEL,
  PREVIOUS_LABEL,
  SCOPES,
  SCOPE_LABEL,
  categorySlices,
  coverage,
  cumulativeSeries,
  dueDayMap,
  entriesWithProjection,
  expectedBalance,
  firstShortfall,
  flowModel,
  monthAbbr,
  monthlyReport,
  percentDone,
  periodMonths,
  periodOf,
  periodSpan,
  periodTitle,
  rankCategories,
  realizedBalance,
  savingsRate,
  shiftPeriod,
  sumMonths,
  topDebtors,
  type PeriodKind,
  type Scope,
} from '../domain/reports'

const BALANCE_TONE = { pos: 'ok', neg: 'danger', zero: 'neutral' } as const

function balanceView(cents: number): { tone: 'pos' | 'neg' | 'zero'; icon: string; word: string } {
  if (cents > 0) return { tone: 'pos', icon: '▲', word: 'Sobra' }
  if (cents < 0) return { tone: 'neg', icon: '▼', word: 'Falta' }
  return { tone: 'zero', icon: '＝', word: 'Equilibrado' }
}

const MODES: { id: ChartMode; label: string }[] = [
  { id: 'barras', label: 'Barras' },
  { id: 'acumulado', label: 'Acumulado' },
]

export default function Reports() {
  const money = useMoney()
  const { hidden } = usePrivacy()
  const uid = useAuth().user!.uid
  const today = useToday()
  const [kind, setKind] = useState<PeriodKind>('mes')
  const [offset, setOffset] = useState(0)
  const [scope, setScope] = useState<Scope>('tudo')
  const [category, setCategory] = useState<string | null>(null)
  const [mode, setMode] = useState<ChartMode>('barras')
  const [selected, setSelected] = useState<string | null>(null)
  // Bruto: o que se paga nas contas. Real: o mesmo, menos o que as pessoas devolvem pelas contas ligadas a compras a receber.
  const [basis, setBasis] = useState<'bruto' | 'real'>('bruto')

  const period = useMemo(() => shiftPeriod(periodOf(kind, today), offset), [kind, offset, today])
  const months = useMemo(() => periodMonths(period), [period])
  const previous = useMemo(() => periodMonths(shiftPeriod(period, -1)), [period])
  const from = months[0]
  const to = months[months.length - 1]

  const bills = useBills(uid)
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  // O período anterior vem primeiro; a consulta do período mostrado é sempre a última.
  const before = useEntriesRange(uid, previous[0], previous[previous.length - 1])
  const entries = useEntriesRange(uid, from, to)

  const view = useMemo(() => {
    const now = entriesWithProjection(entries.data, bills.data, months, today)
    const prev = entriesWithProjection(before.data, bills.data, previous, today)
    // Só dá para descontar quando se olha o que se paga; em "A receber" a pessoa quer ver o que ainda lhe devem.
    const real = basis === 'real' && scope !== 'receber'
    const netNow = real ? netOfReimbursements(now.entries, receivables.data) : null
    const netPrev = real ? netOfReimbursements(prev.entries, receivables.data) : null
    const nowEntries = netNow?.entries ?? now.entries
    const prevEntries = netPrev?.entries ?? prev.entries
    const receivablesNow = netNow?.receivables ?? receivables.data
    const receivablesPrev = netPrev?.receivables ?? receivables.data
    const slices = categorySlices(nowEntries, months, 5)
    const ranked = rankCategories(nowEntries, months)
    const members =
      category === null ? null : category === OTHER_CATEGORIES ? (slices.find((s) => s.category === OTHER_CATEGORIES)?.members ?? []) : [category]
    const pick = (list: typeof now.entries) => (members ? list.filter((e) => members.includes(e.category)) : list)
    const wantPay = scope !== 'receber'
    const wantRecv = scope !== 'pagar'
    const payNow = wantPay ? pick(nowEntries) : []
    const payBefore = wantPay ? pick(prevEntries) : []
    const recv = wantRecv ? receivablesNow : []
    const recvAll = sumMonths(monthlyReport(months, [], receivablesNow, today)).recvTotalCents
    const rows = monthlyReport(months, payNow, recv, today, wantPay ? now.projectedMonths : new Set())
    const beforeRows = monthlyReport(previous, payBefore, wantRecv ? receivablesPrev : [], today)
    return {
      rows,
      totals: sumMonths(rows),
      before: sumMonths(beforeRows),
      slices,
      ranked,
      allEntries: nowEntries,
      reimbursedCents: netNow?.reimbursedCents ?? 0,
      notReceivedCents: netNow?.notReceivedCents ?? 0,
      heat: dueDayMap(pick(nowEntries), receivablesNow, months, scope === 'receber' ? 'receber' : 'pagar'),
      hasAny: slices.length > 0 || recvAll > 0,
      flow: scope !== 'receber' ? flowModel(slices, recvAll) : null,
      debtors: topDebtors(receivables.data, people.data, months, today),
      hasProjection: wantPay && now.projectedMonths.size > 0,
    }
  }, [entries.data, before.data, bills.data, receivables.data, people.data, months, previous, today, scope, category, basis])

  const ready = entries.ready && before.ready && bills.ready && receivables.ready && people.ready
  const failed = entries.error || before.error || bills.error || receivables.error
  const { totals, rows } = view
  const showPay = scope !== 'receber'
  const showRecv = scope !== 'pagar'
  const hasLinked = receivables.data.some((r) => r.billId)
  const showBasis = hasLinked && scope !== 'receber'
  const realView = showBasis && basis === 'real'
  const payName = realView ? 'Gasto real' : 'A pagar'
  // Ordem das listas do relatório. O gráfico e as contas seguem sempre em ordem de mês; só a tabela e a lista mudam.
  const monthOptions = useMemo(
    () => monthSorts({ showPay, showRecv, showBalance: scope === 'tudo', payLabel: payName }),
    [showPay, showRecv, scope, payName],
  )
  const [monthSort, setMonthSort] = useSortChoice('relatorio-meses', monthOptions, MONTH_SORT_DEFAULT)
  const tableRows = useMemo(() => sortMonthsBy(rows, monthSort), [rows, monthSort])
  const [debtorSort, setDebtorSort] = useSortChoice('relatorio-devedores', DEBTOR_SORTS, DEBTOR_SORT_DEFAULT)
  const debtors = useMemo(() => sortDebtorsBy(view.debtors, debtorSort), [view.debtors, debtorSort])
  const expected = balanceView(expectedBalance(totals))
  const realized = realizedBalance(totals)
  const overdue = totals.payOverdueCents + totals.recvOverdueCents
  const empty = !view.hasAny
  const detail = rows.find((r) => r.competence === selected) ?? null
  const versus = PREVIOUS_LABEL[kind]
  const hasBefore = view.before.payTotalCents + view.before.recvTotalCents > 0
  const rate = savingsRate(totals)
  const cover = coverage(totals)
  const acc = cumulativeSeries(rows, scope)
  const shortfall = scope === 'tudo' ? firstShortfall(rows, acc) : null
  const animKey = `${kind}-${offset}-${scope}-${category ?? ''}-${mode}`
  const sectionKey = `${kind}-${offset}`

  // Sinal explícito no saldo da tabela (− falta, + sobra): a cor não é a única pista. Oculto, não revela nem o sinal.
  const signed = (cents: number) => (hidden || cents === 0 ? money(cents) : `${cents < 0 ? '−' : '+'}${money(Math.abs(cents))}`)

  function chooseKind(next: PeriodKind) {
    withTransition(() => {
      setKind(next)
      setOffset(0)
      setSelected(null)
    })
  }
  function move(delta: number) {
    withTransition(() => {
      setOffset(offset + delta)
      setSelected(null)
    })
  }
  // "Tudo" e "A receber" não têm categoria: escolher um deles limpa a categoria. Escolher uma categoria mostra só A pagar.
  function chooseScope(next: Scope) {
    withTransition(() => {
      setScope(next)
      if (next !== 'pagar') setCategory(null)
      setSelected(null)
    })
  }
  function chooseCategory(next: string | null) {
    withTransition(() => {
      setCategory(next)
      if (next !== null) setScope('pagar')
      setSelected(null)
    })
  }
  function chooseMode(next: ChartMode) {
    withTransition(() => setMode(next))
  }
  // Quem toca na rosquinha, na lista ou no fluxo quer ver as contas da categoria: leva até elas.
  function pickCategory(next: string | null) {
    chooseCategory(next)
    if (next === null) return
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      document.getElementById('cat-detail')?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    })
  }

  const chips = category === OTHER_CATEGORIES ? [...view.ranked.map((c) => c.category), OTHER_CATEGORIES] : view.ranked.map((c) => c.category)

  return (
    <main className="page">
      <header className="page-head">
        <h1>Relatórios</h1>
      </header>

      <div className="segmented" role="group" aria-label="Tipo de período">
        {PERIOD_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={k === kind} onClick={() => chooseKind(k)}>
            {PERIOD_LABEL[k]}
          </button>
        ))}
      </div>

      <header className="month-nav">
        <button className="icon-btn labeled" aria-label="Período anterior" onClick={() => move(-1)}>
          <span className="glyph" aria-hidden="true">
            ‹
          </span>
          <span className="label">Anterior</span>
        </button>
        <div className="month-title">
          <h2 aria-live="polite">{periodTitle(period)}</h2>
          {kind !== 'mes' && <span className="muted">{kind === 'ano' ? 'jan a dez' : periodSpan(period)}</span>}
          {offset !== 0 && (
            <button type="button" className="back-pill" onClick={() => move(-offset)}>
              <span aria-hidden="true">↺</span> Voltar ao período atual
            </button>
          )}
        </div>
        <button className="icon-btn labeled" aria-label="Próximo período" onClick={() => move(1)}>
          <span className="glyph" aria-hidden="true">
            ›
          </span>
          <span className="label">Próximo</span>
        </button>
      </header>

      <div className="filters" role="group" aria-label="Filtros do relatório">
        <div className="segmented segmented-small" role="group" aria-label="O que mostrar">
          {SCOPES.map((s) => (
            <button key={s} type="button" aria-pressed={s === scope} onClick={() => chooseScope(s)}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        {showBasis && (
          <div className="basis-row">
            <div className="segmented segmented-small" role="group" aria-label="Tipo de valor das contas">
              <button type="button" aria-pressed={basis === 'bruto'} onClick={() => withTransition(() => setBasis('bruto'))}>
                Bruto
              </button>
              <button type="button" aria-pressed={basis === 'real'} onClick={() => withTransition(() => setBasis('real'))}>
                Real
              </button>
            </div>
            <p className="muted small-note">
              {realView
                ? `Gasto real: o que as pessoas devolvem pelas contas ligadas (${money(view.reimbursedCents)}) já está descontado. ${money(view.notReceivedCents)} ainda não recebidos.`
                : 'Bruto: o que você paga nas contas. Real desconta o que as pessoas devolvem.'}
            </p>
          </div>
        )}
        {scope !== 'receber' && chips.length > 0 && (
          <div className="chips chips-scroll" role="group" aria-label="Categoria">
            <button type="button" className="chip-btn" aria-pressed={category === null} onClick={() => chooseCategory(null)}>
              Todas
            </button>
            {chips.map((c) => (
              <button key={c} type="button" className="chip-btn" aria-pressed={category === c} onClick={() => chooseCategory(category === c ? null : c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {failed && (
        <p className="error" role="alert">
          Não foi possível carregar os dados. Verifique a conexão.
        </p>
      )}

      {!ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : (
        <>
          <section className="kpis vt-kpis" aria-label="Resumo do período">
            {showPay && (
              <div className={`card kpi tone-pay${scope === 'pagar' ? ' kpi-wide' : ''}`}>
                <span className="muted">{payName}</span>
                <strong>{money(totals.payTotalCents)}</strong>
                <Sparkline values={rows.map((r) => r.payTotalCents)} color="var(--pay)" />
                <div className="meter" aria-hidden="true">
                  <div className="meter-fill" style={{ width: `${percentDone(totals.payPaidCents, totals.payTotalCents)}%` }} />
                </div>
                <span className="muted">Pago {money(totals.payPaidCents)}</span>
                <span className="muted">Em aberto {money(totals.payOpenCents)}</span>
                <Delta now={totals.payTotalCents} before={view.before.payTotalCents} goodWhen="down" versus={versus} />
              </div>
            )}
            {showRecv && (
              <div className={`card kpi tone-recv${scope === 'receber' ? ' kpi-wide' : ''}`}>
                <span className="muted">A receber</span>
                <strong>{money(totals.recvTotalCents)}</strong>
                <Sparkline values={rows.map((r) => r.recvTotalCents)} color="var(--recv)" />
                <div className="meter" aria-hidden="true">
                  <div className="meter-fill" style={{ width: `${percentDone(totals.recvReceivedCents, totals.recvTotalCents)}%` }} />
                </div>
                <span className="muted">Recebido {money(totals.recvReceivedCents)}</span>
                <span className="muted">Em aberto {money(totals.recvOpenCents)}</span>
                <Delta now={totals.recvTotalCents} before={view.before.recvTotalCents} goodWhen="up" versus={versus} />
              </div>
            )}
            {scope === 'tudo' && (
              <div className={`card kpi kpi-wide balance-${expected.tone} tone-${BALANCE_TONE[expected.tone]}`}>
                <span className="muted">Saldo previsto do período</span>
                <strong>
                  <span aria-hidden="true">{expected.icon}</span> {expected.word} {money(Math.abs(expectedBalance(totals)))}
                </strong>
                <span className="muted">
                  A receber menos a pagar. Realizado até agora: {realized < 0 ? 'menos ' : ''}
                  {money(Math.abs(realized))}
                </span>
                {rate !== null ? (
                  <span className="muted">Sobram {rate}% do que entra.</span>
                ) : cover !== null && totals.recvTotalCents > 0 ? (
                  <span className="muted">O que entra cobre {cover}% do que sai.</span>
                ) : null}
                {hasBefore && <Delta as="money" now={expectedBalance(totals)} before={expectedBalance(view.before)} goodWhen="up" versus={versus} />}
              </div>
            )}
          </section>

          {overdue > 0 && (
            <p className="banner banner-danger" role="status">
              <span aria-hidden="true">⚠ </span>
              Em atraso no período: {showPay && <>a pagar {money(totals.payOverdueCents)}</>}
              {showPay && showRecv && ' · '}
              {showRecv && <>a receber {money(totals.recvOverdueCents)}</>}
            </p>
          )}

          {empty ? (
            <div className="empty card">
              <h2>Nada neste período</h2>
              <p className="muted">Não há contas nem parcelas nestes meses. Use as setas para ver outro período ou inclua uma conta.</p>
            </div>
          ) : (
            <>
              <section className="card stack chart-card vt-chart" aria-label="Mês a mês">
                <div className="card-head">
                  <h2>Mês a mês</h2>
                  <div className="segmented segmented-small" role="group" aria-label="Tipo de gráfico">
                    {MODES.map((m) => (
                      <button key={m.id} type="button" aria-pressed={m.id === mode} onClick={() => chooseMode(m.id)}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {scope === 'tudo' && mode === 'barras' && (
                  <ul className="legend" aria-label="Legenda">
                    <li>
                      <span className="swatch swatch-pay" aria-hidden="true" /> {payName}
                    </li>
                    <li>
                      <span className="swatch swatch-recv" aria-hidden="true" /> A receber
                    </li>
                  </ul>
                )}
                {scope === 'tudo' && mode === 'acumulado' && (
                  <ul className="legend" aria-label="Legenda">
                    <li>
                      <span className="mark-pos" aria-hidden="true" /> Sobra
                    </li>
                    <li>
                      <span className="mark-neg" aria-hidden="true" /> Falta
                    </li>
                  </ul>
                )}
                {scope !== 'tudo' && (
                  <p className="muted small">
                    {scope === 'pagar' ? 'Só contas a pagar' : 'Só valores a receber'}
                    {category ? ` · ${category}` : ''}
                    {mode === 'acumulado' ? ', somando mês a mês.' : '.'}
                  </p>
                )}
                <MonthlyChart rows={rows} scope={scope} mode={mode} selected={selected} onSelect={setSelected} animKey={animKey} payLabel={payName} />
                <p className="chart-readout" aria-live="polite">
                  {detail ? (
                    <>
                      <strong>{formatCompetence(detail.competence)}</strong>
                      {detail.projected ? ' (previsto)' : ''}
                      {showPay && (
                        <>
                          : {payName.toLowerCase()} {money(detail.payTotalCents)} (pago {money(detail.payPaidCents)})
                        </>
                      )}
                      {showPay && showRecv && ' ·'}
                      {showRecv && (
                        <>
                          {showPay ? ' ' : ': '}a receber {money(detail.recvTotalCents)} (recebido {money(detail.recvReceivedCents)})
                        </>
                      )}
                      {mode === 'acumulado' && (
                        <>
                          {' '}
                          · acumulado {scope === 'tudo' && acc[rows.indexOf(detail)] < 0 ? 'menos ' : ''}
                          {money(Math.abs(acc[rows.indexOf(detail)]))}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="muted">Toque em um mês do gráfico para ver os valores.</span>{' '}
                      <span className="muted">Arraste o dedo para comparar os meses.</span>
                    </>
                  )}
                </p>
                {scope === 'tudo' && mode === 'acumulado' && (
                  <p className={`insight ${shortfall ? 'insight-warn' : 'insight-ok'}`}>
                    <span aria-hidden="true">{shortfall ? '▼ ' : '▲ '}</span>
                    {shortfall ? `Falta dinheiro a partir de ${monthAbbr(shortfall)}.` : 'O saldo acumulado não fica negativo neste período.'}
                  </p>
                )}
              </section>

              <section className="card stack vt-table" aria-label="Detalhamento por mês">
                <h2>Detalhamento</h2>
                {rows.length > 1 && (
                  <SortControl label="Ordenação do detalhamento" options={monthOptions} value={monthSort} onChange={setMonthSort} />
                )}
                <div className="table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th scope="col">Mês</th>
                        {showPay && <th scope="col">{payName}</th>}
                        {showRecv && <th scope="col">A receber</th>}
                        {scope === 'tudo' && <th scope="col">Saldo</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => {
                        const b = balanceView(r.recvTotalCents - r.payTotalCents)
                        return (
                          <tr key={r.competence}>
                            <th scope="row">
                              {monthAbbr(r.competence)}
                              {r.projected ? '*' : ''}
                            </th>
                            {showPay && <td>{money(r.payTotalCents)}</td>}
                            {showRecv && <td>{money(r.recvTotalCents)}</td>}
                            {scope === 'tudo' && (
                              <td className={`balance-${b.tone}`}>
                                {signed(r.recvTotalCents - r.payTotalCents)}
                                <span className="sr-only"> {b.word.toLowerCase()}</span>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        {showPay && <td>{money(totals.payTotalCents)}</td>}
                        {showRecv && <td>{money(totals.recvTotalCents)}</td>}
                        {scope === 'tudo' && (
                          <td className={`balance-${expected.tone}`}>
                            {signed(expectedBalance(totals))}
                            <span className="sr-only"> {expected.word.toLowerCase()}</span>
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {view.hasProjection && <p className="small-note">* Mês sem lançamento ainda: usa o valor previsto das contas cadastradas.</p>}
              </section>

              {showPay && view.slices.length > 0 && (
                <div className="vt-cats">
                  <CategorySection
                    slices={view.slices}
                    entries={view.allEntries}
                    months={months}
                    today={today}
                    category={category}
                    onSelect={pickCategory}
                    onFilter={chooseCategory}
                    animKey={sectionKey}
                    totalLabel={realView ? 'Gasto real' : 'Total a pagar'}
                  />
                </div>
              )}

              {view.flow && (
                <section className="card stack vt-flow" aria-label="Fluxo do dinheiro">
                  <h2>Fluxo do dinheiro</h2>
                  <p className="muted small">
                    O que entra (verde) se divide entre as categorias. Quando as contas passam do que entra, a <strong>▼ Falta</strong> (vermelho) completa o
                    fluxo. Toque numa categoria para ver as contas dela.
                  </p>
                  <FlowChart model={view.flow} active={category} onSelect={pickCategory} animKey={sectionKey} />
                </section>
              )}

              <section className="card stack vt-heat" aria-label="Mapa de vencimentos">
                <h2>Mapa de vencimentos</h2>
                <p className="muted small">
                  {scope === 'receber' ? 'Dias em que as parcelas a receber vencem' : 'Dias em que as contas a pagar vencem'}, somando os meses do período.
                  {scope === 'tudo' ? ' Escolha A receber nos filtros para ver as parcelas.' : ''}
                </p>
                <DueHeatmap key={`${scope}-${category ?? ''}-${sectionKey}`} days={view.heat} tone={scope === 'receber' ? 'receber' : 'pagar'} />
              </section>

              {showRecv && view.debtors.length > 0 && (
                <section className="card stack" aria-label="Quem mais deve">
                  <h2>Quem mais deve neste período</h2>
                  {debtors.length > 1 && (
                    <SortControl label="Ordenação de quem mais deve" options={DEBTOR_SORTS} value={debtorSort} onChange={setDebtorSort} />
                  )}
                  <ul className="list">
                    {debtors.map((d) => (
                      <li key={d.personId}>
                        <Link className="debtor-row" to={`/receber/pessoa/${d.personId}`}>
                          <span className="debtor-name">
                            {d.name}
                            {d.overdueCents > 0 && (
                              <span className="chip chip-atrasada">
                                <span aria-hidden="true">⚠ </span>
                                {money(d.overdueCents)} em atraso
                              </span>
                            )}
                          </span>
                          <strong>{money(d.openCents)}</strong>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="small-note">
                A pagar: pelo mês do lançamento da conta. A receber: pelo mês de vencimento de cada parcela. O saldo compara os dois e não inclui
                saldo em conta.
              </p>
            </>
          )}
        </>
      )}
    </main>
  )
}
