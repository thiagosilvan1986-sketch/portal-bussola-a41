import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { DueSoonBanner } from '../components/DueSoonBanner'
import { EntrySheet } from '../components/EntrySheet'
import { Welcome } from '../components/Welcome'
import { StatusChip } from '../components/StatusChip'
import { useBills, useEntries, usePeople, useReceivables, useToday } from '../data/hooks'
import { ensureEntries, payEntry } from '../data/store'
import { useMoney } from '../data/privacy'
import { dismissWelcome, isWelcomeDismissed } from '../data/welcome'
import { installmentLabel } from '../domain/bills'
import { linkOfEntry } from '../domain/linked'
import { addMonths, competenceOf, formatCompetence, formatDateBR } from '../domain/dates'
import { amountDue, displayStatus, isPending, remainingCents, sortEntries, summarize } from '../domain/entries'
import { KIND_INFO, RECEIVABLE_KINDS, listPath, ofKind, summarizePerson } from '../domain/receivables'

export default function Home() {
  const money = useMoney()
  const uid = useAuth().user!.uid
  const today = useToday()
  const thisMonth = competenceOf(today)
  const [competence, setCompetence] = useState(thisMonth)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  const sorted = useMemo(() => sortEntries(entries.data), [entries.data])
  const summary = useMemo(() => summarize(entries.data, today), [entries.data, today])
  const selected = sorted.find((e) => e.id === selectedId) ?? null
  const dueToday = sorted.filter((e) => e.dueDate === today && isPending(e))

  const hasBills = bills.data.some((b) => b.active)

  // Semáforo do mês: vermelho se há conta atrasada, âmbar se só há contas por pagar, verde se tudo está pago.
  const mainTone =
    summary.overdueCount > 0
      ? { tone: 'danger', icon: '⚠' }
      : summary.pendingCount > 0
        ? { tone: 'warn', icon: '●' }
        : entries.data.length === 0
          ? { tone: 'neutral', icon: '○' }
          : { tone: 'ok', icon: '✓' }

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

      {competence === thisMonth && summary.overdueCount > 0 && (
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
          Vence hoje: {dueToday.map((e) => e.billName).join(', ')}
        </p>
      )}
      {competence === thisMonth && bills.ready && <DueSoonBanner uid={uid} today={today} bills={bills.data} />}

      <section className="summary" aria-label="Resumo do mês">
        <div className={`card summary-main tone-${mainTone.tone}`}>
          <span className="muted">Falta pagar</span>
          <strong>{money(summary.remainingCents)}</strong>
          <span className="muted">
            <span aria-hidden="true">{mainTone.icon} </span>
            {summary.pendingCount === 0
              ? entries.data.length === 0
                ? 'Nenhuma conta neste mês'
                : 'Tudo pago neste mês'
              : summary.pendingCount === 1
                ? '1 conta pendente'
                : `${summary.pendingCount} contas pendentes`}
          </span>
        </div>
        <div className="card tone-ok">
          <span className="muted">Já pago</span>
          <strong>{money(summary.paidCents)}</strong>
        </div>
        <div className="card tone-pay">
          <span className="muted">Total do mês</span>
          <strong>{money(summary.totalCents)}</strong>
        </div>
      </section>

      {!entries.ready || !bills.ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : !hasBills ? (
        <div className="empty card">
          <h2>Cadastre sua primeira conta</h2>
          <p className="muted">
            Cadastre uma vez cada conta que se repete (energia, internet, condomínio…). O app cria o lançamento de todo mês sozinho.
          </p>
          <Link className="btn primary" to="/contas/nova">
            Nova conta
          </Link>
        </div>
      ) : sorted.length === 0 ? (
        <p className="muted center-text">Nenhuma conta vence neste mês.</p>
      ) : (
        <ul className="list">
          {sorted.map((e) => {
            const status = displayStatus(e, today)
            const pending = isPending(e)
            const toInform = pending && amountDue(e) === 0
            return (
              <li key={e.id} className={`row-card status-${status}`}>
                <button className="row-main" onClick={() => setSelectedId(e.id)}>
                  <span className="row-title">{e.billName}</span>
                  <span className="muted">
                    Vence {formatDateBR(e.dueDate)}
                    {installmentLabel(e) && ` · ${installmentLabel(e)}`}
                  </span>
                  <StatusChip status={status} />
                </button>
                <div className="row-side">
                  {toInform ? (
                    <span className="muted">Valor a informar</span>
                  ) : (
                    <strong>{money(pending ? remainingCents(e) : amountDue(e))}</strong>
                  )}
                  {pending && !toInform && (
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
          })}
        </ul>
      )}

      {selected && <EntrySheet
          key={selected.id}
          uid={uid}
          entry={selected}
          today={today}
          billExists={bills.data.some((b) => b.id === selected.billId)}
          link={linkOfEntry(selected, receivables.data, people.data)}
          onClose={() => setSelectedId(null)}
        />}
    </main>
  )
}
