import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { useBills } from '../data/hooks'
import { RECURRENCE_LABEL } from '../domain/bills'
import { PAYMENT_LABEL } from '../domain/labels'
import { formatBRL } from '../domain/money'

export default function Bills() {
  const uid = useAuth().user!.uid
  const bills = useBills(uid)
  const sorted = [...bills.data].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'),
  )

  return (
    <main className="page">
      <header className="page-head">
        <h1>Contas recorrentes</h1>
        <Link className="btn primary small" to="/contas/nova">
          Nova conta
        </Link>
      </header>

      {bills.error && (
        <p className="error" role="alert">
          Não foi possível carregar as contas.
        </p>
      )}

      {!bills.ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : sorted.length === 0 ? (
        <div className="empty card">
          <h2>Nenhuma conta cadastrada</h2>
          <p className="muted">Toque em “Nova conta” para começar. Dica: comece pelas que mais vencem no mesmo dia.</p>
          <p className="muted">
            Já tem uma planilha? <Link to="/ajustes/planilhas">Importe um CSV</Link>.
          </p>
        </div>
      ) : (
        <ul className="list">
          {sorted.map((b) => (
            <li key={b.id} className={b.active ? 'row-card' : 'row-card archived'}>
              <Link className="row-main" to={`/contas/${b.id}`}>
                <span className="row-title">{b.name}</span>
                <span className="muted">
                  Dia {b.dueDay} · {RECURRENCE_LABEL[b.recurrence]} · {PAYMENT_LABEL[b.paymentMethod]}
                </span>
                {!b.active && <span className="chip chip-prevista">Arquivada</span>}
              </Link>
              <div className="row-side">
                <strong>{formatBRL(b.expectedAmountCents)}</strong>
                <span className="muted">{b.valueType === 'fixed' ? 'fixo' : 'estimado'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
