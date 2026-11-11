import { useState } from 'react'

interface Props {
  label: string
  /** O que será apagado, mostrado antes de confirmar. */
  warning?: string
  onConfirm: () => void
  /** Botão grande (largura toda) em vez do pequeno. */
  large?: boolean
}

/** Exclusão em dois toques, sem janela de confirmação do navegador. */
export function DeleteButton({ label, warning, onConfirm, large = false }: Props) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" className={large ? 'btn danger' : 'btn danger small'} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="delete-confirm">
      {warning && (
        <span className="warning-text" role="alert">
          {warning}
        </span>
      )}
      <span className="actions">
        <button type="button" className="btn danger small" onClick={onConfirm}>
          Confirmar exclusão
        </button>
        <button type="button" className="btn small" onClick={() => setAsking(false)}>
          Cancelar
        </button>
      </span>
    </span>
  )
}
