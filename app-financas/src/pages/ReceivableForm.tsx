import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { usePeople, useToday } from '../data/hooks'
import { createReceivable } from '../data/store'
import { formatBRL, parseBRLToCents } from '../domain/money'
import {
  MAX_INSTALLMENTS,
  buildInstallments,
  isValidEmail,
  isValidPhone,
  phoneDigits,
  withFirstReceived,
} from '../domain/receivables'

const NEW_PERSON = '__new'

export default function ReceivableForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const uid = useAuth().user!.uid
  const today = useToday()
  const people = usePeople(uid)

  const [personChoice, setPersonChoice] = useState(params.get('pessoa') ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [total, setTotal] = useState('')
  const [count, setCount] = useState('10')
  const [firstDue, setFirstDue] = useState(today)
  const [received, setReceived] = useState('0')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sortedPeople = useMemo(
    () => [...people.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [people.data],
  )
  const isNew = personChoice === NEW_PERSON || (people.ready && sortedPeople.length === 0)

  const totalCents = parseBRLToCents(total)
  const n = Number(count)
  const validCount = Number.isInteger(n) && n >= 1 && n <= MAX_INSTALLMENTS
  const preview = useMemo(() => {
    if (totalCents === null || totalCents <= 0 || !validCount || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return null
    const list = buildInstallments(totalCents, n, firstDue)
    const first = list[0].amountCents
    const last = list[list.length - 1].amountCents
    return first === last ? `${n} × ${formatBRL(first)}` : `${n} parcelas de ${formatBRL(last)} a ${formatBRL(first)}`
  }, [totalCents, validCount, n, firstDue])

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!isNew && !personChoice) return setError('Escolha a pessoa ou cadastre uma nova.')
    if (isNew) {
      if (!name.trim()) return setError('Informe o nome da pessoa.')
      if (!isValidPhone(phone)) return setError('Telefone inválido. Use DDD e número, por exemplo (11) 91234-5678, ou deixe em branco.')
      if (!isValidEmail(email)) return setError('E-mail inválido. Confira ou deixe em branco.')
    }
    if (!description.trim()) return setError('Informe o que foi comprado ou parcelado.')
    if (totalCents === null || totalCents <= 0) return setError('Informe o valor total. Exemplo: 420,00')
    if (!validCount) return setError(`O número de parcelas deve ser de 1 a ${MAX_INSTALLMENTS}.`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return setError('Informe o vencimento da primeira parcela.')
    const done = Number(received || '0')
    if (!Number.isInteger(done) || done < 0 || done > n - 1) {
      return setError(`As parcelas já recebidas devem ser de 0 a ${n - 1}.`)
    }

    setError(null)
    const installments = withFirstReceived(buildInstallments(totalCents, n, firstDue), done, today)
    const { personId } = createReceivable(uid, {
      person: isNew
        ? { name: name.trim(), phone: phoneDigits(phone), email: email.trim() }
        : { ...sortedPeople.find((p) => p.id === personChoice)!, id: personChoice },
      receivable: {
        description: description.trim(),
        totalCents,
        installmentCount: n,
        firstDueDate: firstDue,
        installments,
        notes: notes.trim(),
      },
    })
    navigate(`/receber/pessoa/${personId}`)
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>Nova compra parcelada</h1>
        <Link className="link-btn" to="/receber">
          Cancelar
        </Link>
      </header>

      <form className="stack card" onSubmit={onSubmit} noValidate>
        {sortedPeople.length > 0 && (
          <label>
            Quem vai pagar
            <select value={isNew ? NEW_PERSON : personChoice} onChange={(e) => setPersonChoice(e.target.value)}>
              <option value="">Escolha…</option>
              {sortedPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={NEW_PERSON}>+ Nova pessoa</option>
            </select>
          </label>
        )}

        {isNew && (
          <>
            <label>
              Nome da pessoa
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana Souza" autoComplete="off" />
            </label>
            <label>
              Telefone / WhatsApp (opcional)
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 91234-5678"
                autoComplete="off"
              />
            </label>
            <label>
              E-mail (opcional)
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana@exemplo.com"
                autoComplete="off"
              />
            </label>
          </>
        )}

        <label>
          O que foi
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Tênis no cartão" />
        </label>

        <div className="row">
          <label>
            Valor total (R$)
            <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="420,00" />
          </label>
          <label>
            Nº de parcelas
            <input
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="10"
            />
          </label>
        </div>

        <label>
          Vencimento da 1ª parcela
          <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
        </label>
        {preview && <p className="muted preview">{preview}, uma por mês.</p>}

        <label>
          Parcelas já recebidas
          <input
            inputMode="numeric"
            value={received}
            onChange={(e) => setReceived(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="0"
          />
        </label>
        <p className="muted small-note">Se a compra já está em andamento, informe quantas parcelas a pessoa já pagou.</p>

        <label>
          Observações (opcional)
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary" type="submit">
          Salvar
        </button>
      </form>
    </main>
  )
}
