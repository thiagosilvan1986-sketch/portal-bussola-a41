import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { ContactImport } from '../components/ContactImport'
import { CopyButton } from '../components/CopyButton'
import { DeleteButton } from '../components/DeleteButton'
import { usePeople, useReceivables } from '../data/hooks'
import { createPerson, deletePerson, updatePerson } from '../data/store'
import { TONE_LABEL, formatPhone, isValidEmail, isValidPhone, personTone, phoneDigits } from '../domain/receivables'
import { copyName } from '../domain/registry'
import type { MessageTone, Person } from '../domain/types'

const log = (e: unknown) => console.error('Falha ao gravar', e)
const MAX_PERSON_NAME = 80

/** Configurações > Contatos > Novo contato / Editar contato. */
export default function ContactForm() {
  const { id } = useParams()
  const uid = useAuth().user!.uid
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  const [params] = useSearchParams()
  const copyId = id ? null : params.get('copiar')

  if (!people.ready || !receivables.ready) {
    return (
      <main className="page">
        <p className="muted center-text">Carregando…</p>
      </main>
    )
  }
  const found = id ? people.data.find((p) => p.id === id) : undefined
  if (id && !found) {
    return (
      <main className="page">
        <p className="error">Contato não encontrado.</p>
        <Link className="btn" to="/cadastros/contatos">
          Voltar
        </Link>
      </main>
    )
  }
  const seed = copyId ? (people.data.find((p) => p.id === copyId) ?? null) : null
  return (
    <Editor
      key={found?.id ?? (seed ? `copia-${seed.id}` : 'novo')}
      uid={uid}
      initial={found ?? null}
      seed={seed}
      names={people.data.map((p) => p.name)}
      purchaseIds={found ? receivables.data.filter((r) => r.personId === found.id).map((r) => r.id) : []}
    />
  )
}

function Editor({
  uid,
  initial,
  seed,
  names,
  purchaseIds,
}: {
  uid: string
  initial: Person | null
  /** "Copiar e criar novo": o contato novo começa com os dados deste. Nada é salvo até tocar em Salvar. */
  seed: Person | null
  names: string[]
  purchaseIds: string[]
}) {
  const navigate = useNavigate()
  const base = initial ?? seed
  const [name, setName] = useState(initial ? initial.name : seed ? copyName(seed.name, names, MAX_PERSON_NAME) : '')
  const [phone, setPhone] = useState(base?.phone ? formatPhone(base.phone) : '')
  const [email, setEmail] = useState(base?.email ?? '')
  const [tone, setTone] = useState<MessageTone>(base ? personTone(base) : 'amigavel')
  const [error, setError] = useState<string | null>(null)

  function save(ev: FormEvent) {
    ev.preventDefault()
    const clean = name.trim()
    if (!clean) return setError('Informe o nome da pessoa.')
    if (!isValidPhone(phone)) return setError('Telefone inválido. Use DDD e número, por exemplo (11) 91234-5678, ou deixe em branco.')
    if (!isValidEmail(email)) return setError('E-mail inválido. Confira ou deixe em branco.')
    const data = { name: clean.slice(0, MAX_PERSON_NAME), phone: phoneDigits(phone), email: email.trim(), tone }
    if (initial) updatePerson(uid, { ...initial, ...data }).catch(log)
    else createPerson(uid, { ...data, charges: [] }).done.catch(log)
    navigate('/cadastros/contatos')
  }

  const n = purchaseIds.length
  return (
    <main className="page">
      <header className="page-head">
        <h1>{initial ? 'Editar contato' : 'Novo contato'}</h1>
        <Link className="link-btn" to="/cadastros/contatos">
          Voltar
        </Link>
      </header>

      <form className="card stack" onSubmit={save} aria-label={initial ? 'Editar contato' : 'Novo contato'} noValidate>
        <ContactImport
          onPick={(c) => {
            if (c.name) setName(c.name)
            if (c.phone) setPhone(c.phone)
            if (c.email) setEmail(c.email)
          }}
        />
        <label>
          Nome
          <input value={name} maxLength={MAX_PERSON_NAME} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Telefone / WhatsApp
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 91234-5678" />
        </label>
        <label>
          E-mail
          <input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@exemplo.com" />
        </label>
        <label>
          Tom da cobrança
          <select value={tone} onChange={(e) => setTone(e.target.value as MessageTone)}>
            <option value="amigavel">{TONE_LABEL.amigavel} (leve, para amigos e família)</option>
            <option value="profissional">{TONE_LABEL.profissional} (mais formal)</option>
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="btn primary" type="submit">
            Salvar contato
          </button>
          <Link className="btn primary cancel-btn" to="/cadastros/contatos">
            <span aria-hidden="true">✕</span> Cancelar
          </Link>
        </div>
      </form>

      {initial && (
        <>
          {n > 0 && (
            <Link className="btn" to={`/receber/pessoa/${initial.id}`}>
              Ver {n === 1 ? 'a compra' : `as ${n} compras`}
            </Link>
          )}
          <CopyButton to={`/cadastros/contatos/novo?copiar=${initial.id}`} />
          <section className="card stack danger-zone" aria-label="Excluir contato">
            <h2>Excluir contato</h2>
            <DeleteButton
              large
              label={n === 0 ? 'Excluir contato' : `Excluir contato e ${n === 1 ? 'a compra' : `as ${n} compras`}`}
              warning={
                n === 0
                  ? `Excluir ${initial.name}? Não dá para desfazer.`
                  : `Isso apaga ${initial.name}, ${n === 1 ? 'a compra' : `as ${n} compras`}, as parcelas e o histórico de cobranças. Não dá para desfazer.`
              }
              onConfirm={() => {
                deletePerson(uid, initial.id, purchaseIds).catch(log)
                navigate('/cadastros/contatos')
              }}
            />
          </section>
        </>
      )}
    </main>
  )
}
