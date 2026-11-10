import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { EntrySheet } from '../components/EntrySheet'
import { StatusChip } from '../components/StatusChip'
import { useBills, useEntries, useSuggestions, useToday } from '../data/hooks'
import { ensureEntries, payEntry } from '../data/store'
import { addMonths, competenceOf, formatCompetence, formatDateBR } from '../domain/dates'
import { amountDue, displayStatus, isPending, remainingCents, sortEntries, summarize } from '../domain/entries'
import { formatBRL } from '../domain/money'

export default function Home() {
  const uid = useAuth().user!.uid
  const today = useToday()
  const thisMonth = competenceOf(today)
  const [competence, setCompetence] = useState(thisMonth)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const bills = useBills(uid)
  const entries = useEntries(uid, competence)
  const suggestions = useSuggestions(uid)

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

  return (
    <main className="page">
      <header className="month-nav">
        <button className="icon-btn" aria-label="Mês anterior" onClick={() => setCompetence(addMonths(competence, -1))}>
          ‹
        </button>
        <div className="month-title">
          <h1>{formatCompetence(competence)}</h1>
          {competence !== thisMonth && (
            <button className="link-btn" onClick={() => setCompetence(thisMonth)}>
              Voltar para o mês atual
            </button>
          )}
        </div>
        <button className="icon-btn" aria-label="Próximo mês" onClick={() => setCompetence(addMonths(competence, 1))}>
          ›
        </button>
      </header>

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
      {suggestions.data.length > 0 && (
        <Link className="banner banner-info" to="/sugestoes">
          {suggestions.data.length === 1
            ? '1 sugestão do seu e-mail espera por você'
            : `${suggestions.data.length} sugestões do seu e-mail esperam por você`}
        </Link>
      )}
      {dueToday.length > 0 && (
        <p className="banner banner-warn" role="status">
          Vence hoje: {dueToday.map((e) => e.billName).join(', ')}
        </p>
      )}

      <section className="summary" aria-label="Resumo do mês">
        <div className="card summary-main">
          <span className="muted">Falta pagar</span>
          <strong>{formatBRL(summary.remainingCents)}</strong>
          <span className="muted">
            {summary.pendingCount === 0
              ? entries.data.length === 0
                ? 'Nenhuma conta neste mês'
                : 'Tudo pago neste mês'
              : summary.pendingCount === 1
                ? '1 conta pendente'
                : `${summary.pendingCount} contas pendentes`}
          </span>
        </div>
        <div className="card">
          <span className="muted">Já pago</span>
          <strong>{formatBRL(summary.paidCents)}</strong>
        </div>
        <div className="card">
          <span className="muted">Total do mês</span>
          <strong>{formatBRL(summary.totalCents)}</strong>
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
                  <span className="muted">Vence {formatDateBR(e.dueDate)}</span>
                  <StatusChip status={status} />
                </button>
                <div className="row-side">
                  {toInform ? (
                    <span className="muted">Valor a informar</span>
                  ) : (
                    <strong>{formatBRL(pending ? remainingCents(e) : amountDue(e))}</strong>
                  )}
                  {pending && !toInform && (
                    <button
                      className="check-btn"
                      aria-label={`Marcar ${e.billName} como paga`}
                      onClick={() => payEntry(uid, e.id, amountDue(e), today).catch((err) => console.error(err))}
                    >
                      ✓
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {selected && <EntrySheet key={selected.id} uid={uid} entry={selected} today={today} onClose={() => setSelectedId(null)} />}
    </main>
  )
}
