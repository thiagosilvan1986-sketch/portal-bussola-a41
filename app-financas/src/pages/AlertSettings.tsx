import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { DeleteButton } from '../components/DeleteButton'
import { useAlertSettings, usePushDevices } from '../data/hooks'
import {
  PushError,
  currentEndpoint,
  endpointId,
  fetchPushConfig,
  notificationPermission,
  pushSupport,
  sendTestPush,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type ServerState,
} from '../data/push'
import { deletePushDevice, savePushDevice, saveAlerts } from '../data/store'
import { settleWithin } from '../data/wait'
import { ALERT_DAY_OPTIONS, dayChipLabel, formatHour, toggleAlertDay, type AlertSettings as Settings } from '../domain/alerts'

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Cadastros > Alertas de vencimento: com quantos dias de antecedência e a que horas avisar, e em quais aparelhos. */
export default function AlertSettings() {
  const { user } = useAuth()
  const uid = user!.uid
  const alerts = useAlertSettings(uid)
  const devices = usePushDevices(uid)
  const settings = alerts.data

  const support = useMemo(() => pushSupport(), [])
  const [server, setServer] = useState<ServerState | 'checking'>('checking')
  const [thisId, setThisId] = useState<string | null>(null)
  const [permission, setPermission] = useState(notificationPermission())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetchPushConfig().then((s) => alive && setServer(s))
    void currentEndpoint()
      .then((endpoint) => (endpoint ? endpointId(endpoint) : null))
      .then((id) => alive && setThisId(id))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const active = thisId !== null && devices.data.some((d) => d.id === thisId)
  const others = devices.data.filter((d) => d.id !== thisId)

  async function change(next: Settings | null) {
    if (!next) {
      setError('Deixe pelo menos um prazo marcado. Para não receber avisos, desligue a chave acima.')
      return
    }
    setError(null)
    setNotice(null)
    try {
      await settleWithin(saveAlerts(uid, next))
    } catch (e) {
      console.error(e)
      setError('Não foi possível salvar. Tente de novo.')
    }
  }

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setNotice(await action())
    } catch (e) {
      console.error(e)
      setError(e instanceof PushError ? e.message : 'Algo deu errado. Tente de novo.')
    } finally {
      setPermission(notificationPermission())
      setBusy(false)
    }
  }

  const enable = () =>
    run(async () => {
      if (server === 'checking' || server.status !== 'ready') return null
      const sub = await subscribeThisDevice(server.publicKey)
      await settleWithin(savePushDevice(uid, { ...sub, createdAt: new Date().toISOString() }))
      setThisId(sub.id)
      return 'Pronto! Este aparelho vai receber os avisos, mesmo com o app fechado.'
    })

  const disable = () =>
    run(async () => {
      const id = (await unsubscribeThisDevice()) ?? thisId
      if (id) await settleWithin(deletePushDevice(uid, id))
      setThisId(null)
      return 'Avisos desativados neste aparelho.'
    })

  const sendTest = () =>
    run(async () => {
      const { sent, total } = await sendTestPush(await user!.getIdToken())
      return sent === 0
        ? 'O aviso não chegou a nenhum aparelho. Tente desativar e ativar de novo neste aparelho.'
        : `Aviso enviado para ${sent === total ? (sent === 1 ? '1 aparelho' : `${sent} aparelhos`) : `${sent} de ${total} aparelhos`}. Pode levar alguns segundos para aparecer.`
    })

  const removeOther = (id: string) =>
    run(async () => {
      await settleWithin(deletePushDevice(uid, id))
      return 'Aparelho removido.'
    })

  return (
    <main className="page">
      <header className="page-head">
        <h1>Alertas de vencimento</h1>
        <Link className="link-btn" to="/cadastros">
          Voltar
        </Link>
      </header>
      <p className="muted">
        Receba um aviso antes de uma conta vencer, no celular e no navegador. Aqui você escolhe com quantos dias de antecedência e a que horas.
      </p>

      {!alerts.ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : (
        <>
          <section className="card stack settings-card" aria-label="Quando avisar">
            <label className="check check-strong">
              <input type="checkbox" checked={settings.enabled} onChange={(e) => void change({ ...settings, enabled: e.target.checked })} />
              Avisar antes de a conta vencer
            </label>

            <div className="stack settings-group" role="group" aria-label="Quantos dias antes">
              <strong>Quantos dias antes</strong>
              <div className="chips chips-days">
                {ALERT_DAY_OPTIONS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className="chip-btn"
                    aria-pressed={settings.days.includes(day)}
                    disabled={!settings.enabled}
                    onClick={() => void change(toggleAlertDay(settings, day))}
                  >
                    {dayChipLabel(day)}
                  </button>
                ))}
              </div>
              <p className="muted">Pode marcar mais de um. “1 dia” avisa na véspera do vencimento.</p>
            </div>

            <label>
              Horário do aviso
              <select
                value={settings.hour}
                disabled={!settings.enabled}
                onChange={(e) => void change({ ...settings, hour: Number(e.target.value) })}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
              <span className="muted">Horário de Brasília. O aviso sai uma vez por dia, a partir dessa hora, e só se houver conta a vencer.</span>
            </label>
            <p className="muted">As mudanças são salvas na hora. A faixa “Vence amanhã” no Início segue estas mesmas escolhas.</p>
          </section>

          <section className="card stack settings-card" aria-label="Neste aparelho">
            <h2>Neste aparelho</h2>
            {support === 'install-first' ? (
              <p>
                No iPhone, o aviso com o app fechado só funciona depois de instalar o app: abra o site no Safari, toque em Compartilhar e em
                “Adicionar à Tela de Início”. Depois abra o app por lá e volte a esta tela.
              </p>
            ) : support === 'unsupported' ? (
              <p>
                Este navegador não recebe avisos com o app fechado. Use o Chrome, o Edge, o Firefox ou o Safari atualizados. A faixa dentro do app
                continua funcionando.
              </p>
            ) : server === 'checking' ? (
              <p className="muted">Verificando o servidor de avisos…</p>
            ) : server.status === 'unavailable' ? (
              <p>
                O envio com o app fechado ainda não foi ligado neste site (falta configurar o servidor de avisos). Enquanto isso, a faixa
                “Vence amanhã” continua aparecendo aqui no app.
              </p>
            ) : active ? (
              <>
                <p>
                  <span aria-hidden="true">✓ </span>Avisos ativos neste aparelho.
                </p>
                <span className="actions actions-column">
                  <button type="button" className="btn primary" disabled={busy} onClick={() => void sendTest()}>
                    Enviar aviso de teste
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void disable()}>
                    Desativar neste aparelho
                  </button>
                </span>
              </>
            ) : permission === 'denied' ? (
              <p>
                As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ou do celular, em Notificações) e volte
                aqui para ativar.
              </p>
            ) : (
              <>
                <p className="muted">O aparelho vai pedir permissão para mostrar notificações.</p>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void enable()}>
                  Ativar neste aparelho
                </button>
              </>
            )}

            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>

          {others.length > 0 && (
            <section className="stack" aria-label="Outros aparelhos">
              <h2>Outros aparelhos com aviso</h2>
              <ul className="list">
                {others.map((d) => (
                  <li key={d.id} className="row-card edit-row">
                    <div className="row-main">
                      <span className="row-title">{d.label}</span>
                      <span className="muted">Ativado em {new Date(d.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <DeleteButton
                      label={`Remover ${d.label}`}
                      warning={`${d.label} deixa de receber os avisos.`}
                      onConfirm={() => void removeOther(d.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {devices.error && (
        <p className="error" role="alert">
          Não foi possível carregar os aparelhos. Verifique a conexão.
        </p>
      )}
    </main>
  )
}
