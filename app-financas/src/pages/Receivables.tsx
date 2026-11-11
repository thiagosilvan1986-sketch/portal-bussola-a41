import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { usePeople, useReceivables, useToday } from '../data/hooks'
import { formatDateBR } from '../domain/dates'
import { formatBRL } from '../domain/money'
import { summarizePerson } from '../domain/receivables'

export default function Receivables() {
  const uid = useAuth().user!.uid
  const today = useToday()
  const people = usePeople(uid)
  const receivables = useReceivables(uid)

  const rows = useMemo(() => {
    return people.data
      .map((p) => ({ person: p, summary: summarizePerson(receivables.data.filter((r) => r.personId === p.id), today) }))
      .sort(
        (a, b) =>
          Number(b.summary.overdueCount > 0) - Number(a.summary.overdueCount > 0) ||
          Number(b.summary.remainingCents > 0) - Number(a.summary.remainingCents > 0) ||
          b.summary.remainingCents - a.summary.remainingCents ||
          a.person.name.localeCompare(b.person.name, 'pt-BR'),
      )
  }, [people.data, receivables.data, today])

  const totals = useMemo(() => summarizePerson(receivables.data, today), [receivables.data, today])
  const ready = people.ready && receivables.ready

  return (
    <main className="page">
      <header className="page-head">
        <h1>A receber</h1>
        <Link className="btn primary small" to="/receber/nova">
          Nova compra
        </Link>
      </header>

      {(people.error || receivables.error) && (
        <p className="error" role="alert">
          Não foi possível carregar os dados. Verifique a conexão.
        </p>
      )}

      {totals.overdueCount > 0 && (
        <p className="banner banner-danger" role="status">
          {totals.overdueCount === 1 ? '1 parcela atrasada' : `${totals.overdueCount} parcelas atrasadas`}, somando{' '}
          {formatBRL(totals.overdueCents)}.
        </p>
      )}

      <section className="summary" aria-label="Resumo do que falta receber">
        <div className="card summary-main">
          <span className="muted">Falta receber</span>
          <strong>{formatBRL(totals.remainingCents)}</strong>
          <span className="muted">
            {totals.purchaseCount === 0
              ? 'Nenhuma compra cadastrada'
              : totals.remainingCents === 0
                ? 'Tudo recebido'
                : totals.purchaseCount === 1
                  ? 'Em 1 compra parcelada'
                  : `Em ${totals.purchaseCount} compras parceladas`}
          </span>
        </div>
        <div className="card">
          <span className="muted">Em atraso</span>
          <strong>{formatBRL(totals.overdueCents)}</strong>
        </div>
        <div className="card">
          <span className="muted">Já recebido</span>
          <strong>{formatBRL(totals.receivedCents)}</strong>
        </div>
      </section>

      {!ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="empty card">
          <h2>Ninguém te deve nada por aqui</h2>
          <p className="muted">
            Comprou ou parcelou algo no cartão para outra pessoa? Cadastre a compra, as parcelas e o contato. O app
            mostra quantas faltam, você dá baixa a cada pagamento e cobra com a mensagem pronta.
          </p>
          <Link className="btn primary" to="/receber/nova">
            Nova compra
          </Link>
        </div>
      ) : (
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
                      : done
                        ? summary.purchaseCount === 1
                          ? '1 compra quitada'
                          : `${summary.purchaseCount} compras quitadas`
                        : `${summary.purchaseCount === 1 ? '1 compra' : `${summary.purchaseCount} compras`}${
                            summary.nextDueDate ? ` · próxima parcela ${formatDateBR(summary.nextDueDate)}` : ''
                          }`}
                  </span>
                  {overdue && (
                    <span className="chip chip-atrasada">
                      {summary.overdueCount === 1 ? '1 parcela atrasada' : `${summary.overdueCount} parcelas atrasadas`}
                    </span>
                  )}
                  {done && <span className="chip chip-paga">Quitado</span>}
                </Link>
                {summary.purchaseCount > 0 && (
                  <div className="row-side">
                    <strong>{formatBRL(summary.remainingCents)}</strong>
                    <span className="muted">falta</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
