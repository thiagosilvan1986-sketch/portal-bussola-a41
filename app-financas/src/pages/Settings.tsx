import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { disconnectGmail, startGmailConnect, syncGmailNow } from '../data/gmail'
import { useGmailStatus, usePrefs, useRecentMail } from '../data/hooks'
import { setOnlySuggest } from '../data/store'
import { formatDateBR, timeAgo } from '../domain/dates'
import { SIGNAL_LABEL, type MailOutcome } from '../domain/suggestions'

const OUTCOME_LABEL: Record<MailOutcome, string> = {
  auto_applied: 'Aplicado automaticamente',
  suggested: 'Virou sugestão',
  scam_blocked: 'Bloqueado: possível golpe',
  duplicate: 'Repetido, ignorado',
  payment_pending_phase3: 'Pagamento detectado (conciliação automática em breve)',
  ignored: 'Ignorado',
}

export default function Settings() {
  const { user, signOut } = useAuth()
  return (
    <main className="page">
      <header className="page-head">
        <h1>Ajustes</h1>
      </header>

      <GmailCard uid={user!.uid} />

      <section className="card stack">
        <h2>Conta</h2>
        <p className="muted">Conectado como {user?.email}</p>
        <button className="btn" onClick={() => void signOut()}>
          Sair
        </button>
      </section>

      <section className="card stack">
        <h2>Instalar no celular</h2>
        <p className="muted">
          No Chrome, abra o menu e toque em “Instalar app” ou “Adicionar à tela inicial”. No iPhone, use o botão de compartilhar do Safari e
          “Adicionar à Tela de Início”.
        </p>
      </section>

      <section className="card stack">
        <h2>Em breve</h2>
        <p className="muted">Conciliação automática de pagamentos e lembretes por notificação.</p>
      </section>
    </main>
  )
}

function GmailCard({ uid }: { uid: string }) {
  const gmail = useGmailStatus(uid)
  const prefs = usePrefs(uid)
  const recent = useRecentMail(uid)
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const returned = params.get('gmail')
  const returnedError = returned === 'erro' ? (params.get('motivo') ?? 'Não foi possível conectar o Gmail.') : null

  async function run(kind: 'connect' | 'sync' | 'disconnect', action: () => Promise<void>) {
    setBusy(kind)
    setError(null)
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.')
    } finally {
      setBusy(null)
    }
  }

  const connect = () =>
    run('connect', async () => {
      window.location.assign(await startGmailConnect())
    })

  const syncNow = () =>
    run('sync', async () => {
      const r = await syncGmailNow()
      const parts = [
        `${r.processed} e-mail${r.processed === 1 ? '' : 's'} lido${r.processed === 1 ? '' : 's'}`,
        r.suggested > 0 ? `${r.suggested} sugest${r.suggested === 1 ? 'ão' : 'ões'}` : null,
        r.autoApplied > 0 ? `${r.autoApplied} aplicado${r.autoApplied === 1 ? '' : 's'} sozinho` : null,
        r.scams > 0 ? `${r.scams} bloqueado${r.scams === 1 ? '' : 's'} como golpe` : null,
      ].filter(Boolean)
      setMessage(parts.join(', ') + (r.remaining > 0 ? `. Faltam ${r.remaining}: toque de novo para continuar.` : '.'))
      if (r.error) setError(r.error)
    })

  const disconnect = () => {
    if (!window.confirm('Desconectar o Gmail? O app deixa de ler seus e-mails. Suas contas continuam salvas.')) return
    return run('disconnect', async () => {
      await disconnectGmail()
      setMessage('Gmail desconectado.')
    })
  }

  return (
    <section className="card stack" aria-label="Gmail">
      <h2>Gmail</h2>

      {returned === 'ok' && <p className="banner banner-ok" role="status">Gmail conectado. Toque em “Verificar agora” para a primeira leitura.</p>}
      {returnedError && (
        <p className="error" role="alert">
          {returnedError}{' '}
          <button className="link-btn" onClick={() => setParams({})}>
            Fechar
          </button>
        </p>
      )}

      {!gmail.ready ? (
        <p className="muted">Carregando…</p>
      ) : !gmail.connected ? (
        <>
          <p className="muted">
            O app lê só as cobranças e os comprovantes que chegam no seu e-mail e sugere cadastrar a conta ou atualizar o valor. Ele só tem
            permissão de leitura: nunca envia, apaga nem altera e-mails, e nunca paga nada.
          </p>
          {gmail.needsReconnect && <p className="error">{gmail.lastError}</p>}
          <button className="btn primary" disabled={busy !== null} onClick={connect}>
            {busy === 'connect' ? 'Abrindo o Google…' : 'Conectar o Gmail'}
          </button>
        </>
      ) : (
        <>
          <p>
            Conectado: <strong>{gmail.email || 'sua conta'}</strong>
          </p>
          <p className="muted">
            {gmail.lastSyncAt ? `Última leitura ${timeAgo(gmail.lastSyncAt)}.` : 'Ainda não leu nenhum e-mail.'} O app verifica sozinho a cada 10 minutos.
            {gmail.pending > 0 && ` Faltam ${gmail.pending} e-mails da primeira leitura (últimos 90 dias).`}
          </p>
          {gmail.lastError && <p className="error">{gmail.lastError}</p>}

          <label className="toggle">
            <input type="checkbox" checked={prefs.onlySuggest} onChange={(e) => void setOnlySuggest(uid, e.target.checked)} />
            <span>
              Só sugerir
              <small className="muted"> — não aplicar nada sozinho; tudo passa por você</small>
            </span>
          </label>

          <div className="btn-row">
            <button className="btn primary" disabled={busy !== null} onClick={syncNow}>
              {busy === 'sync' ? 'Lendo e-mails…' : 'Verificar agora'}
            </button>
            <button className="btn danger" disabled={busy !== null} onClick={disconnect}>
              Desconectar
            </button>
          </div>

          {recent.data.length > 0 && (
            <details>
              <summary>Últimos e-mails lidos</summary>
              <ul className="mail-log">
                {recent.data.map((m) => (
                  <li key={m.id}>
                    <strong>{OUTCOME_LABEL[m.outcome] ?? m.outcome}</strong>
                    <span className="muted">
                      {m.from} · {m.subject || '(sem assunto)'} · {formatDateBR(m.receivedAt)}
                    </span>
                    {m.outcome === 'scam_blocked' && (
                      <span className="muted">{m.detail.split(',').map((x) => SIGNAL_LABEL[x] ?? x).join('; ')}</span>
                    )}
                    {m.outcome === 'auto_applied' && <span className="muted">{m.detail}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {message && <p className="banner banner-ok" role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
