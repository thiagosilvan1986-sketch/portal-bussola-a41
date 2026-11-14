import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { HorizonPicker } from '../components/HorizonPicker'
import { SortControl } from '../components/SortControl'
import { useDeviceChoice } from '../data/devicePrefs'
import { usePeople, useReceivables, useToday } from '../data/hooks'
import { useSortChoice } from '../data/sortPrefs'
import { PERSON_SORTS, PERSON_SORT_DEFAULT, sortPeopleBy } from '../domain/listSorts'
import { formatCompetenceShort, formatDateBR } from '../domain/dates'
import { useMoney } from '../data/privacy'
import {
  KIND_INFO,
  RECEIVABLE_KINDS,
  forecastByMonth,
  lastChargeText,
  kindOfTab,
  listPath,
  HORIZONS,
  horizonPhrase,
  ofKind,
  scopeReceivables,
  summarizePerson,
} from '../domain/receivables'
import type { ReceivableKind } from '../domain/types'

const emptyText: Record<ReceivableKind, { title: string; body: string }> = {
  cartao: {
    title: 'Nenhum reembolso do cartão',
    body: 'Comprou ou parcelou algo no cartão para outra pessoa? Cadastre a compra, as parcelas e o contato. O app mostra quantas faltam, você dá baixa a cada pagamento e cobra com a mensagem pronta.',
  },
  servico: {
    title: 'Nenhum serviço a receber',
    body: 'Prestou um serviço e vai receber depois ou em parcelas? Cadastre aqui para acompanhar o que falta, dar baixa a cada pagamento e cobrar com a mensagem pronta.',
  },
  rateio: {
    title: 'Nenhum rateio de conta',
    body: 'Divide uma conta com alguém (aluguel, energia)? Ligue a parte da pessoa à conta a pagar: o app gera a cobrança todo mês, sem fim até você encerrar, ou pelo número de parcelas que informar.',
  },
}

export default function Receivables() {
  const money = useMoney()
  const uid = useAuth().user!.uid
  const today = useToday()
  const [params] = useSearchParams()
  const kind: ReceivableKind = kindOfTab(params.get('aba'))
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  // O resumo mostra o que falta no mês (padrão), até dezembro ou tudo; a escolha fica neste aparelho.
  const [horizon, setHorizon] = useDeviceChoice('receber-periodo', HORIZONS, 'mes')
  const scoped = useMemo(() => scopeReceivables(receivables.data, horizon, today), [receivables.data, horizon, today])

  // Só as pessoas com compra deste tipo. Contatos sem nenhuma compra ficam em Configurações > Contatos.
  const [personSort, setPersonSort] = useSortChoice('receber', PERSON_SORTS, PERSON_SORT_DEFAULT)
  const rows = useMemo(() => {
    const mine = ofKind(scoped, kind)
    const listed = people.data
      .filter((p) => mine.some((r) => r.personId === p.id))
      .map((p) => ({ person: p, summary: summarizePerson(mine.filter((r) => r.personId === p.id), today) }))
    return sortPeopleBy(listed, personSort)
  }, [people.data, scoped, kind, today, personSort])

  const totals = useMemo(() => summarizePerson(ofKind(scoped, kind), today), [scoped, kind, today])
  const forecast = useMemo(() => forecastByMonth(ofKind(receivables.data, kind), today), [receivables.data, kind, today])
  const overdueByKind = useMemo(
    () =>
      Object.fromEntries(
        RECEIVABLE_KINDS.map((k) => [k, summarizePerson(ofKind(receivables.data, k), today).overdueCount]),
      ) as Record<ReceivableKind, number>,
    [receivables.data, today],
  )
  const ready = people.ready && receivables.ready

  return (
    <main className="page">
      <header className="page-head">
        <h1>A receber</h1>
        <Link className="btn primary small" to={kind === 'cartao' ? '/receber/nova' : `/receber/nova?tipo=${kind}`}>
          {kind === 'rateio' ? 'Novo rateio' : 'Nova compra'}
        </Link>
      </header>

      <nav className="tabs" aria-label="Tipo de valor a receber">
        {RECEIVABLE_KINDS.map((k) => (
          <Link
            key={k}
            aria-current={k === kind ? 'page' : undefined}
            className={`tab ${k === kind ? 'active' : ''}`}
            to={listPath(k)}
            replace
          >
            {KIND_INFO[k].tab}
            {overdueByKind[k] > 0 && (
              <span className="tab-badge" aria-label={`${overdueByKind[k]} em atraso`}>
                {overdueByKind[k]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <p className="muted small-note kind-hint">{KIND_INFO[kind].hint}</p>

      {(people.error || receivables.error) && (
        <p className="error" role="alert">
          Não foi possível carregar os dados. Verifique a conexão.
        </p>
      )}

      {totals.overdueCount > 0 && (
        <p className="banner banner-danger" role="status">
          {totals.overdueCount === 1 ? '1 parcela atrasada' : `${totals.overdueCount} parcelas atrasadas`}, somando{' '}
          {money(totals.overdueCents)}.
        </p>
      )}

      <HorizonPicker value={horizon} onChange={setHorizon} />
      <section className="summary" aria-label="Resumo do que falta receber">
        <div className="card summary-main tone-recv">
          <span className="muted">Falta receber {horizonPhrase(horizon)}</span>
          <strong>{money(totals.remainingCents)}</strong>
          <span className="muted">
            {totals.purchaseCount === 0
              ? 'Nenhuma compra cadastrada'
              : totals.remainingCents === 0
                ? horizon === 'tudo' ? 'Tudo recebido' : `Nada a receber ${horizonPhrase(horizon)}`
                : totals.purchaseCount === 1
                  ? kind === 'rateio' ? 'Em 1 rateio' : 'Em 1 compra parcelada'
                  : kind === 'rateio' ? `Em ${totals.purchaseCount} rateios` : `Em ${totals.purchaseCount} compras parceladas`}
          </span>
        </div>
        <div className={`card ${totals.overdueCents > 0 ? 'tone-danger' : 'tone-neutral'}`}>
          <span className="muted">
            {totals.overdueCents > 0 && <span aria-hidden="true">⚠ </span>}Em atraso
          </span>
          <strong>{money(totals.overdueCents)}</strong>
        </div>
        <div className="card tone-ok">
          <span className="muted">Já recebido {horizon === 'tudo' ? '' : horizonPhrase(horizon)}</span>
          <strong>{money(totals.receivedCents)}</strong>
        </div>
      </section>

      {ready && totals.remainingCents > 0 && <ForecastCard kind={kind} forecast={forecast} />}

      {!ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="empty card">
          <h2>{emptyText[kind].title}</h2>
          <p className="muted">{emptyText[kind].body}</p>
          {kind !== 'rateio' && (
            <p className="muted">
              Já tem uma planilha? <Link to="/cadastros/planilhas">Importe um CSV</Link>.
            </p>
          )}
          <Link className="btn primary" to={kind === 'cartao' ? '/receber/nova' : `/receber/nova?tipo=${kind}`}>
            {kind === 'rateio' ? 'Novo rateio' : 'Nova compra'}
          </Link>
        </div>
      ) : (
        <>
          {rows.length > 1 && (
            <SortControl label="Ordenação das pessoas" options={PERSON_SORTS} value={personSort} onChange={setPersonSort} />
          )}
          <ul className="list">
            {rows.map(({ person, summary }) => {
              const overdue = summary.overdueCount > 0
              const done = summary.purchaseCount > 0 && summary.remainingCents === 0
              return (
                <li key={person.id} className={`row-card ${overdue ? 'status-atrasada' : done ? 'status-paga' : ''}`}>
                  <Link className="row-main" to={`/receber/pessoa/${person.id}`}>
                    <span className="row-title">{person.name}</span>
                    <span className="muted">
                      {summary.purchaseCount === 0
                        ? 'Sem compras'
                        : done && horizon !== 'tudo'
                          ? `Nada a receber ${horizonPhrase(horizon)}`
                          : done
                          ? summary.purchaseCount === 1
                            ? '1 compra quitada'
                            : `${summary.purchaseCount} compras quitadas`
                          : `${kind === 'rateio' ? (summary.purchaseCount === 1 ? '1 rateio' : `${summary.purchaseCount} rateios`) : summary.purchaseCount === 1 ? '1 compra' : `${summary.purchaseCount} compras`}${
                              summary.nextDueDate ? ` · próxima parcela ${formatDateBR(summary.nextDueDate)}` : ''
                            }`}
                    </span>
                    {overdue && (
                      <span className="chip chip-atrasada">
                        <span aria-hidden="true">⚠ </span>
                        {summary.overdueCount === 1 ? '1 parcela atrasada' : `${summary.overdueCount} parcelas atrasadas`}
                      </span>
                    )}
                    {done && (
                      <span className="chip chip-paga">
                        <span aria-hidden="true">✓ </span>
                        {horizon === 'tudo' ? 'Quitado' : 'Em dia'}
                      </span>
                    )}
                    {summary.remainingCents > 0 && lastChargeText(person.charges, today) && (
                      <span className="muted small-note">{lastChargeText(person.charges, today)}</span>
                    )}
                  </Link>
                  {summary.purchaseCount > 0 && (
                    <div className="row-side person-totals">
                      {/* Quanto foi da pessoa no período: o total, o que já entrou e o que falta. */}
                      <strong aria-label={`Total ${horizonPhrase(horizon)}: ${money(summary.receivedCents + summary.remainingCents)}`}>
                        {money(summary.receivedCents + summary.remainingCents)}
                      </strong>
                      <span className="muted">
                        <span className="nowrap">Recebido {money(summary.receivedCents)}</span> ·{' '}
                        <span className="nowrap">Falta {money(summary.remainingCents)}</span>
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}

const forecastText: Record<ReceivableKind, { title: string; intro: string }> = {
  cartao: {
    title: 'Quanto volta por mês',
    intro: 'Parcelas dos reembolsos pelo mês em que vencem. Ajuda a ver quanto da fatura do cartão volta para você.',
  },
  servico: {
    title: 'Quanto entra por mês',
    intro: 'Parcelas dos serviços pelo mês em que vencem.',
  },
  rateio: {
    title: 'Quanto volta por mês',
    intro: 'A parte de cada pessoa nas contas divididas, pelo mês em que vence.',
  },
}

/** Mês a mês: quanto vence, quanto já foi recebido e quanto falta, mais o que ficou atrasado e o que vem depois. */
function ForecastCard({ kind, forecast }: { kind: ReceivableKind; forecast: ReturnType<typeof forecastByMonth> }) {
  const money = useMoney()
  const shown = forecast.months.filter((m) => m.totalCents > 0)
  const biggest = Math.max(1, ...shown.map((m) => m.totalCents))
  const current = forecast.months[0]
  return (
    <details className="card forecast">
      <summary>
        <span>{forecastText[kind].title}</span>
        <span className="muted">
          {current.remainingCents > 0
            ? `Este mês: ${money(current.remainingCents)} a receber`
            : current.totalCents > 0
              ? 'Este mês: tudo recebido'
              : 'Nada vence este mês'}
        </span>
      </summary>
      <p className="muted small-note">{forecastText[kind].intro}</p>
      <ul className="forecast-list">
        {forecast.earlierCents > 0 && (
          <li className="forecast-row wide late">
            <span>Atrasado de meses anteriores</span>
            <strong>{money(forecast.earlierCents)}</strong>
          </li>
        )}
        {shown.map((m) => (
          <li key={m.competence} className="forecast-row">
            <span>{formatCompetenceShort(m.competence)}</span>
            <div
              className="progress"
              role="img"
              aria-label={`${formatCompetenceShort(m.competence)}: ${money(m.receivedCents)} recebidos de ${money(m.totalCents)}`}
              style={{ width: `${Math.max(8, Math.round((m.totalCents / biggest) * 100))}%` }}
            >
              <div className="progress-fill" style={{ width: `${Math.round((m.receivedCents / m.totalCents) * 100)}%` }} />
            </div>
            <strong>{m.remainingCents > 0 ? money(m.remainingCents) : 'Recebido'}</strong>
          </li>
        ))}
        {forecast.laterCents > 0 && (
          <li className="forecast-row wide">
            <span>Depois de {formatCompetenceShort(forecast.months[forecast.months.length - 1].competence)}</span>
            <strong>{money(forecast.laterCents)}</strong>
          </li>
        )}
      </ul>
    </details>
  )
}
