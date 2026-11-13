import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { ContactBatchImport } from '../components/ContactBatchImport'
import { SortControl } from '../components/SortControl'
import { usePeople, useReceivables } from '../data/hooks'
import { useSortChoice } from '../data/sortPrefs'
import { CONTACT_SORTS, CONTACT_SORT_DEFAULT, sortContactsBy } from '../domain/listSorts'
import { formatPhone } from '../domain/receivables'

const purchasesText = (n: number) => (n === 0 ? 'Sem compras' : n === 1 ? '1 compra' : `${n} compras`)

/** Configurações > Contatos: todas as pessoas, com ou sem compra, para criar, editar, copiar e excluir. */
export default function Contacts() {
  const uid = useAuth().user!.uid
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  const [sort, setSort] = useSortChoice('cadastro-contatos', CONTACT_SORTS, CONTACT_SORT_DEFAULT)

  const count = new Map<string, number>()
  for (const r of receivables.data) count.set(r.personId, (count.get(r.personId) ?? 0) + 1)
  const listed = sortContactsBy(
    people.data.map((p) => ({ name: p.name, purchases: count.get(p.id) ?? 0, person: p })),
    sort,
  )

  return (
    <main className="page">
      <header className="page-head">
        <h1>Contatos</h1>
        <Link className="link-btn" to="/cadastros">
          Voltar
        </Link>
      </header>
      <p className="muted">As pessoas de quem você tem algo a receber. Os contatos sem compra só aparecem aqui e na escolha da pessoa em “Nova compra”.</p>

      {people.error && (
        <p className="error" role="alert">
          Não foi possível carregar os contatos. Verifique a conexão.
        </p>
      )}

      {!people.ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : (
        <>
          <Link className="btn primary" to="/cadastros/contatos/novo">
            Novo contato
          </Link>
          <ContactBatchImport uid={uid} people={people.data} />
          {listed.length === 0 ? (
            <p className="muted center-text">Nenhum contato cadastrado.</p>
          ) : (
            <>
              {listed.length > 1 && <SortControl label="Ordenação dos contatos" options={CONTACT_SORTS} value={sort} onChange={setSort} />}
              <ul className="list">
                {listed.map(({ person }) => (
                  <li key={person.id} className="row-card edit-row">
                    <div className="row-main">
                      <span className="row-title">{person.name}</span>
                      <span className="muted">
                        {[person.phone ? formatPhone(person.phone) : '', person.email, purchasesText(count.get(person.id) ?? 0)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <span className="actions row-actions">
                      <Link className="btn small" to={`/cadastros/contatos/${person.id}`} aria-label={`Editar o contato ${person.name}`}>
                        Editar
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  )
}
