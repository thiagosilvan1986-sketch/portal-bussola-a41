import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { DeleteButton } from '../components/DeleteButton'
import { SortControl } from '../components/SortControl'
import { useRegistry } from '../data/hooks'
import { useMoney } from '../data/privacy'
import { useSortChoice } from '../data/sortPrefs'
import { saveRegistry } from '../data/store'
import { settleWithin } from '../data/wait'
import { RECURRENCE_LABEL } from '../domain/bills'
import { TEMPLATE_SORTS, TEMPLATE_SORT_DEFAULT, sortTemplatesBy } from '../domain/listSorts'
import { missingDefaultTemplates, paymentLabel, removeTemplate } from '../domain/registry'

/** Lista dos atalhos de conta: criar, editar, excluir e recuperar os padrões. */
export default function Shortcuts() {
  const money = useMoney()
  const uid = useAuth().user!.uid
  const registry = useRegistry(uid)
  const reg = registry.data
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const missing = missingDefaultTemplates(reg)
  const [sort, setSort] = useSortChoice('cadastro-atalhos', TEMPLATE_SORTS, TEMPLATE_SORT_DEFAULT)
  const listed = sortTemplatesBy(reg.templates, sort)

  async function save(next: typeof reg) {
    setBusy(true)
    setError(null)
    try {
      await settleWithin(saveRegistry(uid, next))
    } catch (e) {
      console.error(e)
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>Atalhos de conta</h1>
        <Link className="link-btn" to="/cadastros">
          Voltar
        </Link>
      </header>
      <p className="muted">
        Modelos que aparecem em “Nova conta”. Um toque preenche o que você guardou aqui. O atalho some da lista quando a conta já está cadastrada.
      </p>

      {!registry.ready ? (
        <p className="muted center-text">Carregando seus cadastros…</p>
      ) : (
        <>
          <Link className="btn primary" to="/cadastros/atalhos/novo">
            Novo atalho
          </Link>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {reg.templates.length === 0 ? (
            <p className="muted center-text">Você não tem atalhos. Crie um ou recupere os padrões.</p>
          ) : (
            <>
              {reg.templates.length > 1 && (
                <SortControl label="Ordenação dos atalhos" options={TEMPLATE_SORTS} value={sort} onChange={setSort} />
              )}
              <ul className="list">
                {listed.map((t) => (
                  <li key={t.id} className="row-card edit-row">
                    <div className="row-main">
                      <span className="row-title">{t.name}</span>
                      <span className="muted">
                        {t.category} · {RECURRENCE_LABEL[t.recurrence]} · {paymentLabel(reg, t.paymentMethod)}
                        {t.dueDay !== null && ` · dia ${t.dueDay}`}
                        {t.amountCents > 0 && ` · ${money(t.amountCents)}`}
                      </span>
                    </div>
                    <span className="actions row-actions">
                      <Link className="btn small" to={`/cadastros/atalhos/${t.id}`} aria-label={`Editar o atalho ${t.name}`}>
                        Editar
                      </Link>
                      <DeleteButton
                        label="Excluir"
                        warning={`Excluir o atalho “${t.name}”? As contas já cadastradas não mudam.`}
                        onConfirm={() => void save(removeTemplate(reg, t.id))}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {missing.length > 0 && (
            <section className="card stack" aria-label="Atalhos padrão">
              <h2>Atalhos padrão</h2>
              <p className="muted">
                {missing.length === 1 ? 'Falta 1 atalho' : `Faltam ${missing.length} atalhos`} da lista que o app oferece de início. Recuperar não mexe nos seus.
              </p>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void save({ ...reg, templates: [...reg.templates, ...missing] })}
              >
                Recuperar atalhos padrão
              </button>
            </section>
          )}
        </>
      )}
    </main>
  )
}
