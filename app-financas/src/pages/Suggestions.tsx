import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { useBills, useGmailStatus, useSuggestions, useToday } from '../data/hooks'
import { acceptApplyCharge, acceptNewBill, dismissSuggestion, trustSender } from '../data/store'
import { formatDateBR } from '../domain/dates'
import { formatBRL } from '../domain/money'
import { SIGNAL_LABEL, type Suggestion } from '../domain/suggestions'
import type { Bill } from '../domain/types'

export default function Suggestions() {
  const uid = useAuth().user!.uid
  const suggestions = useSuggestions(uid)
  const bills = useBills(uid)
  const gmail = useGmailStatus(uid)
  const today = useToday()

  return (
    <main className="page">
      <header className="page-head">
        <h1>Sugestões</h1>
      </header>

      {suggestions.error && (
        <p className="error" role="alert">
          Não foi possível carregar as sugestões.
        </p>
      )}

      {!suggestions.ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : suggestions.data.length === 0 ? (
        <div className="empty card">
          <h2>Nada para decidir agora</h2>
          {gmail.connected ? (
            <p className="muted">
              Quando chegar uma cobrança nova ou com valor diferente no seu e-mail, ela aparece aqui para você confirmar.
            </p>
          ) : (
            <>
              <p className="muted">Conecte o Gmail para o app avisar de cobranças novas e de valores que mudaram.</p>
              <Link className="btn primary" to="/ajustes">
                Conectar o Gmail
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="list">
          {suggestions.data.map((s) => (
            <SuggestionCard key={s.id} uid={uid} s={s} bills={bills.data} today={today} />
          ))}
        </ul>
      )}
    </main>
  )
}

function SuggestionCard({ uid, s, bills, today }: { uid: string; s: Suggestion; bills: Bill[]; today: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      console.error(e)
      setError('Não foi possível concluir. Tente de novo.')
      setBusy(false)
    }
  }

  const source = (
    <p className="muted source">
      {s.from} · {s.subject}
    </p>
  )

  if (s.type === 'scam_alert') {
    return (
      <li className="card suggestion suggestion-scam">
        <h2>Possível golpe</h2>
        <p>Este e-mail foi bloqueado e nada foi alterado nas suas contas.</p>
        <ul className="reasons">
          {(s.signals ?? []).map((sig) => (
            <li key={sig}>{SIGNAL_LABEL[sig] ?? sig}</li>
          ))}
        </ul>
        {source}
        <div className="btn-row">
          <button className="btn primary" disabled={busy} onClick={() => run(() => dismissSuggestion(uid, s))}>
            Entendi
          </button>
          {s.billId && (
            <button className="btn" disabled={busy} onClick={() => run(() => trustSender(uid, s))}>
              É legítimo: aceitar este remetente
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </li>
    )
  }

  if (s.type === 'new_bill' && s.draft) {
    const d = s.draft
    return (
      <li className="card suggestion">
        <h2>Nova conta: {d.name}</h2>
        <dl className="facts">
          <dt>Valor</dt>
          <dd>{d.amountCents === null ? 'Não informado' : formatBRL(d.amountCents)}</dd>
          <dt>Vencimento</dt>
          <dd>{d.dueDate ? formatDateBR(d.dueDate) : 'Não informado'}</dd>
          <dt>Categoria</dt>
          <dd>{d.category}</dd>
        </dl>
        <p className="muted">Cadastra como conta mensal. Você pode ajustar depois em Contas.</p>
        {source}
        <div className="btn-row">
          <button className="btn primary" disabled={busy} onClick={() => run(() => acceptNewBill(uid, s, today))}>
            Cadastrar
          </button>
          <button className="btn" disabled={busy} onClick={() => run(() => dismissSuggestion(uid, s))}>
            Ignorar
          </button>
        </div>
        <button className="link-btn" disabled={busy} onClick={() => run(() => dismissSuggestion(uid, s, true))}>
          Nunca sugerir deste remetente
        </button>
        {error && <p className="error">{error}</p>}
      </li>
    )
  }

  const patch = s.patch ?? {}
  const hasAmount = patch.chargedAmountCents !== undefined
  const hasDue = patch.dueDate !== undefined
  return (
    <li className="card suggestion">
      <h2>{s.billName}</h2>
      {hasAmount && s.previous && (
        <p>
          <strong>Valor diferente:</strong> de {formatBRL(s.previous.amountCents)} para {formatBRL(patch.chargedAmountCents!)}
        </p>
      )}
      {hasDue && s.previous && (
        <p>
          <strong>Vencimento diferente:</strong> de {formatDateBR(s.previous.dueDate)} para {formatDateBR(patch.dueDate!)}
        </p>
      )}
      {!hasAmount && !hasDue && <p>Cobrança recebida por e-mail. Confirma para guardar o código de pagamento.</p>}
      {s.lowConfidence && <p className="muted">Não tenho certeza de que este e-mail é desta conta. Confirme só se for.</p>}
      {source}
      <div className="btn-row">
        <button className="btn primary" disabled={busy} onClick={() => run(() => acceptApplyCharge(uid, s, bills))}>
          {hasAmount || hasDue ? 'Atualizar' : 'Confirmar'}
        </button>
        <button className="btn" disabled={busy} onClick={() => run(() => dismissSuggestion(uid, s))}>
          Ignorar
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  )
}
