import { useId } from 'react'
import { flipDir, type SortChoice, type SortOption } from '../domain/sorting'

interface Props<K extends string> {
  options: readonly SortOption<K>[]
  value: SortChoice<K>
  onChange: (choice: SortChoice<K>) => void
  /** Nome da lista, para quem usa leitor de tela: "Ordenação das contas". */
  label?: string
}

/**
 * "Ordenar por" + botão que inverte o sentido. O botão mostra com texto o sentido de agora (Crescente ou
 * Decrescente), com a seta só como reforço. Critérios que são regra fechada (Situação, Ordem de cadastro) não
 * têm o botão.
 */
export function SortControl<K extends string>({ options, value, onChange, label = 'Ordenação da lista' }: Props<K>) {
  const id = useId()
  const current = options.find((o) => o.key === value.key) ?? options[0]
  const asc = value.dir === 'asc'
  return (
    <div className="sort-bar" role="group" aria-label={label}>
      <label className="sort-field" htmlFor={id}>
        <span>Ordenar por</span>
        <select
          id={id}
          value={current.key}
          onChange={(ev) => {
            const next = options.find((o) => o.key === ev.target.value)
            if (next) onChange({ key: next.key, dir: next.dir })
          }}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {current.directional !== false && (
        <button
          type="button"
          className="btn sort-dir"
          aria-label={`Ordem ${asc ? 'crescente' : 'decrescente'}. Toque para inverter`}
          onClick={() => onChange({ key: current.key, dir: flipDir(value.dir) })}
        >
          <span aria-hidden="true">{asc ? '↑' : '↓'}</span> {asc ? 'Crescente' : 'Decrescente'}
        </button>
      )}
    </div>
  )
}
