import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMoney } from '../data/privacy'
import { diffDays } from '../domain/dates'
import { chargeMessage, daysAgoText, channelVia, lastCharge, mailtoUrl, whatsappUrl } from '../domain/receivables'
import type { ChargeChannel, IsoDate, Person, Receivable } from '../domain/types'

interface Props {
  person: Person
  receivables: Receivable[]
  today: IsoDate
  onClose: () => void
  /** Abre a edição do contato quando falta telefone ou e-mail. */
  onEditContact: () => void
  /** Avisa que a cobrança foi aberta por este canal, para entrar no histórico. */
  onCharged: (info: { channel: ChargeChannel; totalCents: number; overdue: boolean }) => void
}

/**
 * Cobrança: mostra a mensagem pronta (editável) e abre o WhatsApp ou o e-mail já com o texto.
 * O app não envia sozinho: quem toca em "enviar" é você, dentro do WhatsApp ou do e-mail.
 */
export function ChargeSheet({ person, receivables, today, onClose, onEditContact, onCharged }: Props) {
  const money = useMoney()
  const message = useMemo(() => chargeMessage(person, receivables, today), [person, receivables, today])
  const [text, setText] = useState(message?.text ?? '')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A última cobrança de antes de abrir esta folha, para avisar de cobrança repetida.
  const [previous] = useState(() => lastCharge(person.charges))
  const box = useRef<HTMLTextAreaElement>(null)

  // A caixa cresce até caber a mensagem inteira, para não precisar rolar dentro dela.
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current
      if (!el || el.scrollHeight === 0) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [text])

  const wa = message ? whatsappUrl(person.phone, text) : null
  const mail = message ? mailtoUrl(person.email, message.subject, text) : null

  function charged(channel: ChargeChannel) {
    if (message) onCharged({ channel, totalCents: message.totalCents, overdue: message.kind === 'overdue' })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      charged('copia')
      setCopied(true)
      setError(null)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Cobrar ${person.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header className="sheet-head">
          <div>
            <h2>Cobrar {person.name}</h2>
            {message && (
              <p className="muted">
                {message.kind === 'overdue' ? 'Em atraso: ' : 'Próxima parcela: '}
                <strong>{money(message.totalCents)}</strong>
              </p>
            )}
          </div>
          <span className={message?.kind === 'overdue' ? 'chip chip-atrasada' : 'chip chip-prevista'}>
            {message?.kind === 'overdue' ? 'Atrasada' : 'Lembrete'}
          </span>
        </header>

        {!message ? (
          <p className="muted">Não há nada a receber desta pessoa.</p>
        ) : (
          <div className="stack">
            {previous && (
              <p className={`banner ${diffDays(previous.date, today) <= 2 ? 'banner-warn' : 'banner-note'}`} role="status">
                Você já cobrou {person.name.split(/\s+/)[0]} {daysAgoText(diffDays(previous.date, today))}{' '}
                {channelVia(previous.channel)}.
              </p>
            )}
            <label>
              Mensagem (você pode ajustar antes de enviar)
              <textarea ref={box} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
            </label>

            {wa ? (
              <a className="btn primary" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => charged('whatsapp')}>
                Enviar pelo WhatsApp
              </a>
            ) : (
              <p className="muted">
                Para enviar pelo WhatsApp, cadastre o telefone de {person.name}.{' '}
                <button type="button" className="link-btn" onClick={onEditContact}>
                  Cadastrar telefone
                </button>
              </p>
            )}

            {mail ? (
              <a className="btn" href={mail} onClick={() => charged('email')}>
                Enviar por e-mail
              </a>
            ) : (
              <p className="muted">
                Para enviar por e-mail, cadastre o e-mail de {person.name}.{' '}
                <button type="button" className="link-btn" onClick={onEditContact}>
                  Cadastrar e-mail
                </button>
              </p>
            )}

            <button type="button" className="btn ghost" onClick={() => void copy()}>
              {copied ? 'Mensagem copiada' : 'Copiar mensagem'}
            </button>
            <p className="muted small-note">
              O WhatsApp ou o e-mail abre com a mensagem pronta e a conversa com {person.name}; falta só tocar em enviar.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <button type="button" className="btn" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}
