import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { DueSoonBanner } from '../components/DueSoonBanner'
import { EntrySheet } from '../components/EntrySheet'
import { ParcelSheet } from '../components/ParcelSheet'
import { SortControl } from '../components/SortControl'
import { Welcome } from '../components/Welcome'
import { StatusChip } from '../components/StatusChip'
import { useBills, useEntries, usePeople, useReceivables, useToday } from '../data/hooks'
import { ensureEntries, payEntry, setInstallmentPayment } from '../data/store'
import { useDeviceChoice } from '../data/devicePrefs'
import { useMoney } from '../data/privacy'
import { useSortChoice } from '../data/sortPrefs'
import { dismissWelcome, isWelcomeDismissed } from '../data/welcome'
import { installmentLabel } from '../domain/bills'
import { linkOfEntry } from '../domain/linked'
import { addMonths, competenceOf, formatCompetence, formatDateBR } from '../domain/dates'
import { amountDue } from '../domain/entries'
import { ENTRY_SORTS, ENTRY_SORT_DEFAULT } from '../domain/listSorts'
import {
  SIDES,
  SIDE_LABEL,
  SITUATIONS,
  SITUATION_LABEL,
  filterMovements,
  monthMovements,
  monthTotals,
  sortMovements,
  type Movement,
} from '../domain/movements'
import { KIND_INFO, RECEIVABLE_KINDS, extendRecurring, listPath, ofKind, parcelShort, summarizePerson } from '../domain/receivables'
import { alphabetical } from '../domain/text'

export default function Home() {
  const money = useMoney()
  const uid = useAuth().user!.uid
  const today = useToday()
  const thisMonth = competenceOf(today)
  const [competence, setCompetence] = useState(thisMonth)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Filtros da lista: o que mostrar (guardado neste aparelho, padrão Tudo), situação e categoria.
  const [side, setSide] = useDeviceChoice('inicio-lado', SIDES, 'tudo')
  const [situation, setSituation] = useDeviceChoice('inicio-situacao', SITUATIONS, 'todas')
  const [category, setCategory] = useState('')
  const [showWelcome, setShowWelcome] = useState(() => !isWelcomeDismissed())

  // A apresentação aparece uma única vez: ao mostrá-la, já fica registrado que foi vista.
  useEffect(() => {
    if (showWelcome) dismissWelcome()
  }, [showWelcome])

  const bills = useBills(uid)
  const entries = useEntries(uid, competence)
  const receivables = useReceivables(uid)
  const people = usePeople(uid)

  // Parcelas vencidas que outras pessoas ainda não pagaram, separadas por tipo.
  const lateToReceive = useMemo(
    () =>
      RECEIVABLE_KINDS.map((kind) => ({ kind, ...summarizePerson(ofKind(receivables.data, kind), today) })).filter(
        (k) => k.overdueCount > 0,
      ),
    [receivables.data, today],
  )

  // Garante os lançamentos do mês atual, do próximo e do mês que está sendo visto (se for futuro).
  useEffect(() => {
    if (!bills.ready) return
    const targets = new Set([thisMonth, addMonths(thisMonth, 1)])
    if (competence >= thisMonth) targets.add(competence)
    ensureEntries(uid, bills.data, [...targets]).catch((e) => console.warn('Não foi possível gerar lançamentos', e))
  }, [uid, bills.ready, bills.data, thisMonth, competence])

  const [entrySort, setEntrySort] = useSortChoice('inicio', ENTRY_SORTS, ENTRY_SORT_DEFAULT)
  // Contas e parcelas a receber do mês, numa lista só. Num mês mais à frente, o rateio sem fim é completado até ele.
  const all = useMemo(() => {
    const recv = competence > addMonths(thisMonth, 1) ? receivables.data.map((r) => extendRecurring(r, competence)) : receivables.data
    return monthMovements(entries.data, recv, people.data, bills.data, competence, today)
  }, [entries.data, receivables.data, people.data, bills.data, competence, thisMonth, today])
  const categories = useMemo(() => alphabetical([...new Set(all.map((m) => m.category).filter((c): c is string => !!c))], (c) => c), [all])
  const activeCategory = side !== 'receber' && categories.includes(category) ? category : ''
  // O resumo segue o filtro "o que mostrar" e a categoria; a situação só filtra a lista.
  const totals = useMemo(() => monthTotals(filterMovements(all, { side, situation: 'todas', category: activeCategory })), [all, side, activeCategory])
  const shown = useMemo(
    () => sortMovements(filterMovements(all, { side, situation, category: activeCategory }), entrySort),
    [all, side, situation, activeCategory, entrySort],
  )
  const selected = all.find((m) => m.key === selectedKey) ?? null
  const dueToday = all.filter((m) => m.kind === 'conta' && m.dueDate === today && m.pending)
  const summary = totals.pay
  const balance = totals.recv.totalCents - totals.pay.totalCents

  const hasBills = bills.data.some((b) => b.active)

  // Semáforo do mês: vermelho se há conta atrasada, âmbar se só há contas por pagar, verde se tudo está pago.
  const mainTone =
    summary.overdueCount > 0
      ? { tone: 'danger', icon: '⚠' }
      : summary.pendingCount > 0
        ? { tone: 'warn', icon: '●' }
        : summary.count === 0
          ? { tone: 'neutral', icon: '○' }
          : { tone: 'ok', icon: '✓' }

  function billRow(m: Extract<Movement, { kind: 'conta' }>) {
    const e = m.entry
    const toInform = m.pending && amountDue(e) === 0
    return (
      <li key={m.key} className={`row-card row-pay status-${m.status}`}>
        <button className="row-main" onClick={() => setSelectedKey(m.key)}>
          <span className="row-title">{e.billName}</span>
          <span className="muted">
            Vence {formatDateBR(e.dueDate)}
            {installmentLabel(e) && ` · ${installmentLabel(e)}`}
          </span>
          <StatusChip status={m.status} />
        </button>
        <div className="row-side">
          {toInform ? <span className="muted">Valor a informar</span> : <strong className="pay-amount">− {money(m.shownCents)}</strong>}
          {m.pending && !toInform && (
            <button
              className="check-btn labeled"
              aria-label={`Paguei ${e.billName}`}
              onClick={() => payEntry(uid, e.id, amountDue(e), today).catch((err) => console.error(err))}
            >
              <span aria-hidden="true">✓</span> Paguei
            </button>
          )}
        </div>
      </li>
    )
  }

  function parcelRow(m: Extract<Movement, { kind: 'parcela' }>) {
    const r = m.receivable
    const i = m.installment
    const short = parcelShort(r, i)
    return (
      <li key={m.key} className={`row-card row-recv status-${m.status}`}>
        <button className="row-main" onClick={() => setSelectedKey(m.key)}>
          <span className="row-title">{m.name}</span>
          <span className="muted">
            A receber · {KIND_INFO[r.kind].title}
            {short && r.recurring === true ? ` · ${short}` : ''} · vence {formatDateBR(i.dueDate)}
          </span>
          <StatusChip status={m.status} receber />
        </button>
        <div className="row-side">
          <strong className="recv-amount">+ {money(m.shownCents)}</strong>
          {m.pending && (
            <button
              className="check-btn labeled"
              aria-label={`Recebi ${m.name}`}
              onClick={() => setInstallmentPayment(uid, r, i.number, { paidAt: today, paidAmountCents: i.amountCents }).catch((err) => console.error(err))}
            >
              <span aria-hidden="true">✓</span> Recebi
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <main className="page">
      <header className="month-nav">
        <button className="icon-btn labeled" aria-label="Mês anterior" onClick={() => setCompetence(addMonths(competence, -1))}>
          <span className="glyph" aria-hidden="true">
            ‹
          </span>
          <span className="label">Anterior</span>
        </button>
        <div className="month-title">
          <h1>{formatCompetence(competence)}</h1>
          {competence !== thisMonth && (
            <button type="button" className="back-pill" onClick={() => setCompetence(thisMonth)}>
              <span aria-hidden="true">↺</span> Voltar para o mês atual
            </button>
          )}
        </div>
        <button className="icon-btn labeled" aria-label="Próximo mês" onClick={() => setCompetence(addMonths(competence, 1))}>
          <span className="glyph" aria-hidden="true">
            ›
          </span>
          <span className="label">Próximo</span>
        </button>
      </header>

      {showWelcome && (
        <Welcome
          onDismiss={() => {
            dismissWelcome()
            setShowWelcome(false)
          }}
        />
      )}

      {(entries.error || bills.error) && (
        <p className="error" role="alert">
          Não foi possível carregar os dados. Verifique a conexão e as regras do Firestore.
        </p>
      )}

      {competence === thisMonth && side !== 'receber' && summary.overdueCount > 0 && (
        <p className="banner banner-danger" role="status">
          {summary.overdueCount === 1 ? '1 conta atrasada' : `${summary.overdueCount} contas atrasadas`}. Confira a lista abaixo.
        </p>
      )}
      {lateToReceive.map((k) => (
        <Link key={k.kind} className="banner banner-danger banner-link" to={listPath(k.kind)}>
          <span>
            A receber em atraso · {KIND_INFO[k.kind].title}: {k.overdueCount === 1 ? '1 parcela' : `${k.overdueCount} parcelas`},{' '}
            {money(k.overdueCents)}
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      ))}
      {dueToday.length > 0 && (
        <p className="banner banner-warn" role="status">
          Vence hoje: {dueToday.map((m) => m.name).join(', ')}
        </p>
      )}
      {competence === thisMonth && bills.ready && <DueSoonBanner uid={uid} today={today} bills={bills.data} />}

      <div className="segmented home-side" role="group" aria-label="O que mostrar">
        {SIDES.map((k) => (
          <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)}>
            {SIDE_LABEL[k]}
          </button>
        ))}
      </div>

      <section className="summary" aria-label="Resumo do mês">
        {side === 'receber' ? (
          <>
            <div className={`card summary-main ${totals.recv.overdueCount > 0 ? 'tone-danger' : 'tone-recv'}`}>
              <span className="muted">Falta receber</span>
              <strong>{money(totals.recv.remainingCents)}</strong>
              <span className="muted">
                {totals.recv.count === 0
                  ? 'Nada a receber neste mês'
                  : totals.recv.pendingCount === 0
                    ? 'Tudo recebido neste mês'
                    : totals.recv.pendingCount === 1
                      ? '1 parcela pendente'
                      : `${totals.recv.pendingCount} parcelas pendentes`}
              </span>
            </div>
            <div className="card tone-ok">
              <span className="muted">Já recebido</span>
              <strong>{money(totals.recv.doneCents)}</strong>
            </div>
            <div className="card tone-recv">
              <span className="muted">Total do mês</span>
              <strong>{money(totals.recv.totalCents)}</strong>
            </div>
          </>
        ) : (
          <>
            <div className={`card summary-main tone-${mainTone.tone}`}>
              <span className="muted">Falta pagar</span>
              <strong>{money(summary.remainingCents)}</strong>
              <span className="muted">
                <span aria-hidden="true">{mainTone.icon} </span>
                {summary.pendingCount === 0
                  ? summary.count === 0
                    ? 'Nenhuma conta neste mês'
                    : 'Tudo pago neste mês'
                  : summary.pendingCount === 1
                    ? '1 conta pendente'
                    : `${summary.pendingCount} contas pendentes`}
              </span>
            </div>
            {side === 'tudo' ? (
              <>
                <div className="card tone-recv">
                  <span className="muted">Falta receber</span>
                  <strong>{money(totals.recv.remainingCents)}</strong>
                </div>
                <div className={`card ${balance < 0 ? 'tone-danger' : balance > 0 ? 'tone-ok' : 'tone-neutral'}`}>
                  <span className="muted">
                    <span aria-hidden="true">{balance < 0 ? '▼ ' : balance > 0 ? '▲ ' : ''}</span>
                    Saldo do mês
                  </span>
                  <strong>{money(Math.abs(balance))}</strong>
                  <span className="muted small">{balance < 0 ? 'Falta: sai mais do que entra' : balance > 0 ? 'Sobra: entra mais do que sai' : 'Equilibrado'}</span>
                </div>
              </>
            ) : (
              <>
                <div className="card tone-ok">
                  <span className="muted">Já pago</span>
                  <strong>{money(summary.doneCents)}</strong>
                </div>
                <div className="card tone-pay">
                  <span className="muted">Total do mês</span>
                  <strong>{money(summary.totalCents)}</strong>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {!entries.ready || !bills.ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : !hasBills && side !== 'receber' && all.length === 0 ? (
        <div className="empty card">
          <h2>Cadastre sua primeira conta</h2>
          <p className="muted">
            Cadastre uma vez cada conta que se repete (energia, internet, condomínio…). O app cria o lançamento de todo mês sozinho.
          </p>
          <Link className="btn primary" to="/contas/nova">
            Nova conta
          </Link>
        </div>
      ) : (
        <>
          <div className="filters home-filters" role="group" aria-label="Filtros da lista">
            <label>
              Situação
              <select value={situation} onChange={(e) => setSituation(e.target.value as typeof situation)}>
                {SITUATIONS.map((k) => (
                  <option key={k} value={k}>
                    {SITUATION_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {side !== 'receber' && categories.length > 0 && (
              <label>
                Categoria
                <select value={activeCategory} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {shown.length > 1 && (
            <SortControl label="Ordenação das contas do mês" options={ENTRY_SORTS} value={entrySort} onChange={setEntrySort} />
          )}
          {shown.length === 0 ? (
            <p className="muted center-text">
              {all.length === 0 ? 'Nada vence neste mês.' : 'Nada com esses filtros neste mês.'}
            </p>
          ) : (
            <ul className="list">
              {shown.map((m) => (m.kind === 'conta' ? billRow(m) : parcelRow(m)))}
            </ul>
          )}
        </>
      )}

      {selected?.kind === 'conta' && (
        <EntrySheet
          key={selected.key}
          uid={uid}
          entry={selected.entry}
          today={today}
          billExists={bills.data.some((b) => b.id === selected.entry.billId)}
          link={linkOfEntry(selected.entry, receivables.data, people.data)}
          onClose={() => setSelectedKey(null)}
        />
      )}
      {selected?.kind === 'parcela' && (
        <ParcelSheet
          key={selected.key}
          uid={uid}
          today={today}
          receivable={selected.receivable}
          installment={selected.installment}
          personName={selected.personName}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </main>
  )
}
