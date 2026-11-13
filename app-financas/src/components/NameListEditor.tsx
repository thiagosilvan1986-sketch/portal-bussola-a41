import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSortChoice } from '../data/sortPrefs'
import { NAME_SORTS, NAME_SORT_DEFAULT, sortNamesBy } from '../domain/listSorts'
import { copyName } from '../domain/registry'
import { alphabetical } from '../domain/text'
import { CopyButton } from './CopyButton'
import { SortControl } from './SortControl'

export interface NameItem {
  key: string
  label: string
  /** Quantas contas usam este item. */
  used: number
  /** Item padrão do app: aparece, mas não muda nem sai. */
  locked?: boolean
}

interface Props {
  title: string
  /** Identifica a lista para guardar a ordem escolhida neste aparelho: "categorias", "pagamentos", "fornecedores". */
  sortId: string
  intro: string
  /** "categoria", "forma de pagamento", "fornecedor": entra nos textos. */
  noun: string
  /** Artigo do substantivo: "Nova categoria" / "Novo fornecedor". */
  feminine: boolean
  items: NameItem[]
  placeholder: string
  /** true: ao excluir, as contas passam para outro item da lista. false: elas só mantêm o nome escrito. */
  movesOnDelete: boolean
  /** Para onde mover por padrão (a chave). Se faltar, vale o primeiro outro item. */
  defaultMoveTo?: string
  loading: boolean
  /** Cada ação devolve a mensagem de erro, ou null se deu certo. */
  onAdd: (name: string) => Promise<string | null>
  onRename: (key: string, name: string) => Promise<string | null>
  onRemove: (key: string, moveTo: string) => Promise<string | null>
}

const usage = (n: number) => (n === 0 ? 'Nenhuma conta usa' : n === 1 ? 'Usada em 1 conta' : `Usada em ${n} contas`)

/** Lista editável (criar, renomear, excluir) usada em Categorias, Formas de pagamento e Fornecedores. */
export function NameListEditor(props: Props) {
  const { title, sortId, intro, noun, feminine, items, placeholder, movesOnDelete, defaultMoveTo, loading, onAdd, onRename, onRemove } = props
  const [sort, setSort] = useSortChoice(`cadastro-${sortId}`, NAME_SORTS, NAME_SORT_DEFAULT)
  const listed = sortNamesBy(items, sort)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<string | null>, done: () => void) {
    setBusy(true)
    setError(null)
    try {
      const problem = await action()
      if (problem) setError(problem)
      else done()
    } catch (e) {
      console.error(e)
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  function submitAdd(ev: FormEvent) {
    ev.preventDefault()
    void run(
      () => onAdd(newName),
      () => setNewName(''),
    )
  }

  function submitRename(ev: FormEvent, key: string) {
    ev.preventDefault()
    void run(
      () => onRename(key, editName),
      () => setEditing(null),
    )
  }

  /** "Copiar e criar novo": cria na hora "Nome (cópia)" (a lista não tem outros campos para preencher antes). */
  function copy(item: NameItem) {
    setEditing(null)
    setRemoving(null)
    void run(
      () => onAdd(copyName(item.label, items.map((i) => i.label))),
      () => undefined,
    )
  }

  function startRemove(item: NameItem) {
    const others = items.filter((i) => i.key !== item.key)
    setEditing(null)
    setError(null)
    setRemoving(item.key)
    setMoveTo(defaultMoveTo && others.some((i) => i.key === defaultMoveTo) ? defaultMoveTo : (others[0]?.key ?? ''))
  }

  function confirmRemove(item: NameItem) {
    void run(
      () => onRemove(item.key, moveTo),
      () => setRemoving(null),
    )
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>{title}</h1>
        <Link className="link-btn" to="/cadastros">
          Voltar
        </Link>
      </header>
      <p className="muted">{intro}</p>

      {loading ? (
        <p className="muted center-text">Carregando seus cadastros…</p>
      ) : (
        <>
          <form className="card stack" onSubmit={submitAdd} aria-label={`Cadastro de ${noun}`}>
            <label>
              {feminine ? 'Nova' : 'Novo'} {noun}
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={placeholder} maxLength={60} />
            </label>
            <button className="btn primary" type="submit" disabled={busy || newName.trim() === ''}>
              Adicionar
            </button>
          </form>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {items.length > 1 && <SortControl label={`Ordenação de ${title.toLowerCase()}`} options={NAME_SORTS} value={sort} onChange={setSort} />}

          <ul className="list">
            {listed.map((item) => {
              const others = items.filter((i) => i.key !== item.key)
              return (
                <li key={item.key} className="row-card edit-row">
                  {editing === item.key ? (
                    <form className="stack edit-form" onSubmit={(ev) => submitRename(ev, item.key)} aria-label={`Renomear ${item.label}`}>
                      <label>
                        Novo nome
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} autoFocus />
                      </label>
                      {item.used > 0 && (
                        <p className="muted">
                          {item.used === 1 ? 'A conta que usa passa' : `As ${item.used} contas que usam passam`} a mostrar o nome novo.
                        </p>
                      )}
                      <span className="actions">
                        <button className="btn primary small" type="submit" disabled={busy}>
                          Salvar nome
                        </button>
                        <button className="btn small" type="button" onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      </span>
                    </form>
                  ) : removing === item.key ? (
                    <div className="stack edit-form">
                      <strong>Excluir “{item.label}”?</strong>
                      {movesOnDelete && item.used > 0 ? (
                        <label>
                          {item.used === 1 ? 'A conta que usa passa' : `As ${item.used} contas que usam passam`} para:
                          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                            {alphabetical(others, (o) => o.label).map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : movesOnDelete ? (
                        <p className="muted">Nenhuma conta usa {feminine ? 'esta' : 'este'} {noun}.</p>
                      ) : (
                        <p className="muted">
                          {item.used > 0
                            ? `${item.used === 1 ? 'A conta continua' : `As ${item.used} contas continuam`} com este nome escrito; ele só sai da lista.`
                            : 'Ele só sai da lista.'}
                        </p>
                      )}
                      <span className="actions">
                        <button className="btn danger small" type="button" disabled={busy} onClick={() => confirmRemove(item)}>
                          Confirmar exclusão
                        </button>
                        <button className="btn small" type="button" onClick={() => setRemoving(null)}>
                          Cancelar
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="row-main">
                        <span className="row-title">{item.label}</span>
                        <span className="muted">{item.locked ? 'Padrão do app · não muda' : usage(item.used)}</span>
                      </div>
                      {!item.locked && (
                        <span className="actions row-actions">
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => {
                              setRemoving(null)
                              setError(null)
                              setEditing(item.key)
                              setEditName(item.label)
                            }}
                          >
                            Renomear
                          </button>
                          <button
                            className="btn danger small"
                            type="button"
                            disabled={movesOnDelete && others.length === 0}
                            onClick={() => startRemove(item)}
                          >
                            Excluir
                          </button>
                          <CopyButton small disabled={busy} onClick={() => copy(item)} />
                        </span>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {items.length === 0 && <p className="muted center-text">Nada cadastrado ainda.</p>}
        </>
      )}
    </main>
  )
}
