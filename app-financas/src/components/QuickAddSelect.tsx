import { useState } from 'react'

const NEW = '__novo'

interface Props {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  /** Texto da opção no fim da lista: "+ Nova categoria". */
  newLabel: string
  /** Título do campo que aparece ao escolher a opção nova: "Nome da nova categoria". */
  inputLabel: string
  placeholder?: string
  /**
   * Cadastra o item novo. Devolve o valor a escolher na lista ou a mensagem de erro (nome repetido, vazio…).
   * Quem chama grava em Ajustes; a lista se atualiza sozinha.
   */
  onCreate: (name: string) => { ok: true; value: string; label: string } | { ok: false; error: string }
}

/**
 * Lista de escolha com cadastro rápido: a última opção ("+ Nova …") abre ali mesmo um campo com Adicionar e Cancelar.
 * O item novo fica salvo nos cadastros e já vem escolhido, sem sair da tela nem perder o que foi preenchido.
 */
export function QuickAddSelect({ label, value, options, onChange, newLabel, inputLabel, placeholder, onCreate }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // O valor criado agora pode ainda não ter chegado na lista (a gravação volta pelo servidor): mostra mesmo assim.
  const [pending, setPending] = useState<{ value: string; label: string } | null>(null)
  // Enquanto isso, quem chama pode listar o valor novo pelo próprio código: vale o nome digitado.
  const shown = pending
    ? options.some((o) => o.value === pending.value)
      ? options.map((o) => (o.value === pending.value ? pending : o))
      : [...options, pending]
    : options

  function add() {
    const result = onCreate(name)
    if (!result.ok) return setError(result.error)
    setPending({ value: result.value, label: result.label })
    onChange(result.value)
    setAdding(false)
    setName('')
    setError(null)
  }

  function cancel() {
    setAdding(false)
    setName('')
    setError(null)
  }

  return (
    <div className="quick-add">
      <label>
        {label}
        <select
          value={adding ? NEW : value}
          onChange={(e) => {
            if (e.target.value === NEW) setAdding(true)
            else {
              setAdding(false)
              onChange(e.target.value)
            }
          }}
        >
          {shown.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value={NEW}>{newLabel}</option>
        </select>
      </label>
      {adding && (
        <div className="quick-add-box" role="group" aria-label={newLabel.replace(/^\+\s*/, '')}>
          <label>
            {inputLabel}
            <input
              value={name}
              autoFocus
              placeholder={placeholder}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Enter adiciona sem enviar o formulário da conta.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="quick-add-actions">
            <button type="button" className="btn primary small" onClick={add}>
              Adicionar
            </button>
            <button type="button" className="btn small" onClick={cancel}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
