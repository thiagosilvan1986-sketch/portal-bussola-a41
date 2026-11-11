import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { MonthlyChart } from '../components/MonthlyChart'
import { useBills, useEntriesRange, usePeople, useReceivables, useToday } from '../data/hooks'
import { useMoney, usePrivacy } from '../data/privacy'
import { formatCompetence } from '../domain/dates'
import {
  PERIOD_KINDS,
  PERIOD_LABEL,
  byCategory,
  entriesWithProjection,
  expectedBalance,
  monthAbbr,
  monthlyReport,
  percentDone,
  periodMonths,
  periodOf,
  periodSpan,
  periodTitle,
  realizedBalance,
  shiftPeriod,
  sumMonths,
  topDebtors,
  type PeriodKind,
} from '../domain/reports'

const BALANCE_TONE = { pos: 'ok', neg: 'danger', zero: 'neutral' } as const

function balanceView(cents: number): { tone: 'pos' | 'neg' | 'zero'; icon: string; word: string } {
  if (cents > 0) return { tone: 'pos', icon: '▲', word: 'Sobra' }
  if (cents < 0) return { tone: 'neg', icon: '▼', word: 'Falta' }
  return { tone: 'zero', icon: '＝', word: 'Equilibrado' }
}

export default function Reports() {
  const money = useMoney()
  const { hidden } = usePrivacy()
  const uid = useAuth().user!.uid
  const today = useToday()
  const [kind, setKind] = useState<PeriodKind>('trimestre')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)

  const period = useMemo(() => shiftPeriod(periodOf(kind, today), offset), [kind, offset, today])
  const months = useMemo(() => periodMonths(period), [period])
  const from = months[0]
  const to = months[months.length - 1]

  const bills = useBills(uid)
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  const entries = useEntriesRange(uid, from, to)

  const view = useMemo(() => {
    const projection = entriesWithProjection(entries.data, bills.data, months, today)
    const rows = monthlyReport(months, projection.entries, receivables.data, today, projection.projectedMonths)
    return {
      rows,
      totals: sumMonths(rows),
      categories: byCategory(projection.entries, months),
      debtors: topDebtors(receivables.data, people.data, months, today),
      hasProjection: projection.projectedMonths.size > 0,
    }
  }, [entries.data, bills.data, receivables.data, people.data, months, today])

  const ready = entries.ready && bills.ready && receivables.ready && people.ready
  const failed = entries.error || bills.error || receivables.error
  const { totals, rows } = view
  const expected = balanceView(expectedBalance(totals))
  const realized = realizedBalance(totals)
  const overdue = totals.payOverdueCents + totals.recvOverdueCents
  const empty = totals.payTotalCents === 0 && totals.recvTotalCents === 0
  const detail = rows.find((r) => r.competence === selected) ?? null

  // Sinal explícito no saldo da tabela (− falta, + sobra): a cor não é a única pista. Oculto, não revela nem o sinal.
  const signed = (cents: number) => (hidden || cents === 0 ? money(cents) : `${cents < 0 ? '−' : '+'}${money(Math.abs(cents))}`)

  function chooseKind(next: PeriodKind) {
    setKind(next)
    setOffset(0)
    setSelected(null)
  }
  function move(delta: number) {
    setOffset(offset + delta)
    setSelected(null)
  }

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
          <span className="muted">{kind === 'ano' ? 'jan a dez' : periodSpan(period)}</span>
          {offset !== 0 && (
            <button className="link-btn" onClick={() => move(-offset)}>
              Voltar ao período atual
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

      {failed && (
        <p className="error" role="alert">
          Não foi possível carregar os dados. Verifique a conexão.
        </p>
      )}

      {!ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : (
        <>
          <section className="kpis" aria-label="Resumo do período">
            <div className="card kpi tone-pay">
              <span className="muted">A pagar</span>
              <strong>{money(totals.payTotalCents)}</strong>
              <div className="meter" aria-hidden="true">
                <div className="meter-fill" style={{ width: `${percentDone(totals.payPaidCents, totals.payTotalCents)}%` }} />
              </div>
              <span className="muted">Pago {money(totals.payPaidCents)}</span>
              <span className="muted">Em aberto {money(totals.payOpenCents)}</span>
            </div>
            <div className="card kpi tone-recv">
              <span className="muted">A receber</span>
              <strong>{money(totals.recvTotalCents)}</strong>
              <div className="meter" aria-hidden="true">
                <div className="meter-fill" style={{ width: `${percentDone(totals.recvReceivedCents, totals.recvTotalCents)}%` }} />
              </div>
              <span className="muted">Recebido {money(totals.recvReceivedCents)}</span>
              <span className="muted">Em aberto {money(totals.recvOpenCents)}</span>
            </div>
            <div className={`card kpi kpi-wide balance-${expected.tone} tone-${BALANCE_TONE[expected.tone]}`}>
              <span className="muted">Saldo previsto do período</span>
              <strong>
                <span aria-hidden="true">{expected.icon}</span> {expected.word} {money(Math.abs(expectedBalance(totals)))}
              </strong>
              <span className="muted">
                A receber menos a pagar. Realizado até agora: {realized < 0 ? 'menos ' : ''}
                {money(Math.abs(realized))}
              </span>
            </div>
          </section>

          {overdue > 0 && (
            <p className="banner banner-danger" role="status">
              <span aria-hidden="true">⚠ </span>
              Em atraso no período: a pagar {money(totals.payOverdueCents)} · a receber {money(totals.recvOverdueCents)}
            </p>
          )}

          {empty ? (
            <div className="empty card">
              <h2>Nada neste período</h2>
              <p className="muted">Não há contas nem parcelas nestes meses. Use as setas para ver outro período ou inclua uma conta.</p>
            </div>
          ) : (
            <>
              <section className="card stack chart-card" aria-label="Mês a mês">
                <h2>Mês a mês</h2>
                <ul className="legend" aria-label="Legenda">
                  <li>
                    <span className="swatch swatch-pay" aria-hidden="true" /> A pagar
                  </li>
                  <li>
                    <span className="swatch swatch-recv" aria-hidden="true" /> A receber
                  </li>
                </ul>
                <MonthlyChart rows={rows} selected={selected} onSelect={setSelected} />
                <p className="chart-readout" aria-live="polite">
                  {detail ? (
                    <>
                      <strong>{formatCompetence(detail.competence)}</strong>
                      {detail.projected ? ' (previsto)' : ''}: a pagar {money(detail.payTotalCents)} (pago {money(detail.payPaidCents)}) · a receber{' '}
                      {money(detail.recvTotalCents)} (recebido {money(detail.recvReceivedCents)})
                    </>
                  ) : (
                    <span className="muted">Toque em um mês do gráfico para ver os valores.</span>
                  )}
                </p>
              </section>

              <section className="card stack" aria-label="Detalhamento por mês">
                <h2>Detalhamento</h2>
                <div className="table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th scope="col">Mês</th>
                        <th scope="col">A pagar</th>
                        <th scope="col">A receber</th>
                        <th scope="col">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const b = balanceView(r.recvTotalCents - r.payTotalCents)
                        return (
                          <tr key={r.competence}>
                            <th scope="row">
                              {monthAbbr(r.competence)}
                              {r.projected ? '*' : ''}
                            </th>
                            <td>{money(r.payTotalCents)}</td>
                            <td>{money(r.recvTotalCents)}</td>
                            <td className={`balance-${b.tone}`}>
                              {signed(r.recvTotalCents - r.payTotalCents)}
                              <span className="sr-only"> {b.word.toLowerCase()}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td>{money(totals.payTotalCents)}</td>
                        <td>{money(totals.recvTotalCents)}</td>
                        <td className={`balance-${expected.tone}`}>
                          {signed(expectedBalance(totals))}
                          <span className="sr-only"> {expected.word.toLowerCase()}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {view.hasProjection && <p className="small-note">* Mês sem lançamento ainda: usa o valor previsto das contas cadastradas.</p>}
              </section>

              {view.categories.length > 0 && (
                <section className="card stack" aria-label="Contas a pagar por categoria">
                  <h2>Para onde vai o dinheiro</h2>
                  <ul className="cat-list">
                    {view.categories.map((c) => (
                      <li key={c.category}>
                        <div className="cat-line">
                          <span>{c.category}</span>
                          <span>
                            <strong>{money(c.totalCents)}</strong> <span className="muted">· {c.share}%</span>
                          </span>
                        </div>
                        <div className="bar-track" aria-hidden="true">
                          <div className="bar-fill" style={{ width: `${Math.max(c.share, 2)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {view.debtors.length > 0 && (
                <section className="card stack" aria-label="Quem mais deve">
                  <h2>Quem mais deve neste período</h2>
                  <ul className="list">
                    {view.debtors.map((d) => (
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
