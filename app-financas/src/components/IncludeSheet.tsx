import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'

interface Option {
  to: string
  title: string
  text: string
  tone: 'pay' | 'receive' | 'neutral'
}

const PAY: Option = {
  to: '/contas/nova',
  title: 'Conta a pagar',
  text: 'Energia, aluguel, internet… Cadastre uma vez e o app cria o lançamento de todo mês.',
  tone: 'pay',
}
const RECEIVE: Option = {
  to: '/receber/nova',
  title: 'Valor a receber',
  text: 'Reembolso do cartão ou serviço prestado, em parcelas, com cobrança por WhatsApp ou e-mail.',
  tone: 'receive',
}
const IMPORT: Option = {
  to: '/ajustes/planilhas',
  title: 'Importar planilha',
  text: 'Traga várias contas ou recebimentos de uma vez, a partir de um arquivo CSV.',
  tone: 'neutral',
}

/** Quem está na área "A receber" vê primeiro o que recebe; nas demais telas, o que paga. */
export function includeOptions(pathname: string): Option[] {
  return pathname.startsWith('/receber') ? [RECEIVE, PAY, IMPORT] : [PAY, RECEIVE, IMPORT]
}

/** Folha "Incluir": um só lugar, em qualquer tela, para cadastrar o que paga ou o que recebe. */
export function IncludeSheet({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation()

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Incluir" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>O que você quer incluir?</h2>
        <ul className="include-list">
          {includeOptions(pathname).map((o) => (
            <li key={o.to}>
              <Link className={`include-option include-${o.tone}`} to={o.to} onClick={onClose}>
                <span className="include-icon" aria-hidden="true">
                  {o.tone === 'pay' ? '−' : o.tone === 'receive' ? '+' : '↥'}
                </span>
                <span className="include-text">
                  <strong>{o.title}</strong>
                  <span className="muted">{o.text}</span>
                </span>
                <span aria-hidden="true" className="include-go">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button className="btn ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>,
    document.body,
  )
}
