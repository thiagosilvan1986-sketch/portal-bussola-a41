import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useBills, usePeople, useReceivables, useRegistry, useToday } from '../data/hooks'
import { createReceivable, updateReceivable } from '../data/store'
import { centsToInput, formatBRL, parseBRLToCents } from '../domain/money'
import { ContactImport } from '../components/ContactImport'
import { CopyButton } from '../components/CopyButton'
import { MoneyInput } from '../components/MoneyInput'
import { copyName } from '../domain/registry'
import { addMonths, competenceOf, dueDateFor, formatCompetence } from '../domain/dates'
import {
  KIND_INFO,
  MAX_INSTALLMENTS,
  RECEIVABLE_KINDS,
  TONE_LABEL,
  buildInstallments,
  buildRateio,
  editReceivable,
  formatPhone,
  isCardBill,
  isValidEmail,
  isValidPhone,
  lastPaidNumber,
  listPath,
  personTone,
  phoneDigits,
  receivableFormTitle,
  withFirstReceived,
} from '../domain/receivables'
import type { Competence, MessageTone, Person, Receivable, ReceivableKind } from '../domain/types'

const NEW_PERSON = '__new'
const log = (e: unknown) => console.error('Falha ao gravar', e)

export default function ReceivableForm() {
  const { id } = useParams()
  const uid = useAuth().user!.uid
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  const [params] = useSearchParams()
  const copyPurchase = id ? null : params.get('copiarCompra')
  const copyPerson = id ? null : params.get('copiarPessoa')

  if (!id && (copyPurchase || copyPerson)) {
    // "Copiar e criar novo": o cadastro novo já vem preenchido. Nada é salvo até tocar em Salvar.
    if (!people.ready || !receivables.ready) return <main className="page"><p className="muted center-text">Carregando…</p></main>
    return (
      <Form
        key={`copia-${copyPurchase ?? copyPerson}`}
        uid={uid}
        people={people.data}
        peopleReady
        copyOf={copyPurchase ? receivables.data.find((r) => r.id === copyPurchase) : undefined}
        copyPerson={copyPerson ? people.data.find((p) => p.id === copyPerson) : undefined}
      />
    )
  }
  if (!id) return <Form key="nova" uid={uid} people={people.data} peopleReady={people.ready} />

  if (!people.ready || !receivables.ready) {
    return (
      <main className="page">
        <p className="muted center-text">Carregando…</p>
      </main>
    )
  }
  const edit = receivables.data.find((r) => r.id === id)
  if (!edit) {
    return (
      <main className="page">
        <p className="error">Compra não encontrada.</p>
        <Link className="btn" to="/receber">
          Voltar
        </Link>
      </main>
    )
  }
  return (
    <Form
      key={edit.id}
      uid={uid}
      people={people.data}
      peopleReady
      edit={edit}
      editPerson={people.data.find((p) => p.id === edit.personId)}
    />
  )
}

interface FormProps {
  uid: string
  people: Person[]
  peopleReady: boolean
  /** Presente quando está editando uma compra já cadastrada. */
  edit?: Receivable
  editPerson?: Person
  /** "Copiar e criar novo" de uma compra: dados e pessoa dela, sem as baixas. */
  copyOf?: Receivable
  /** "Copiar e criar novo" de uma pessoa: contato dela como pessoa nova. */
  copyPerson?: Person
}

function Form({ uid, people, peopleReady, edit, editPerson, copyOf, copyPerson }: FormProps) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const today = useToday()

  const source = edit ?? copyOf
  const tipo = params.get('tipo')
  const [kind, setKind] = useState<ReceivableKind>(source?.kind ?? (tipo === 'servico' || tipo === 'rateio' ? tipo : 'cartao'))
  const [personChoice, setPersonChoice] = useState(copyPerson ? NEW_PERSON : copyOf ? copyOf.personId : (params.get('pessoa') ?? ''))
  const [name, setName] = useState(copyPerson ? copyName(copyPerson.name, people.map((p) => p.name), 60) : '')
  const [phone, setPhone] = useState(copyPerson?.phone ? formatPhone(copyPerson.phone) : '')
  const [email, setEmail] = useState(copyPerson?.email ?? '')
  const [tone, setTone] = useState<MessageTone>(copyPerson ? personTone(copyPerson) : 'amigavel')
  const [description, setDescription] = useState(edit ? edit.description : copyOf ? copyName(copyOf.description, [copyOf.description], 80) : '')
  const [total, setTotal] = useState(source ? centsToInput(source.totalCents) : '')
  const [count, setCount] = useState(source ? String(source.installmentCount) : '10')
  // A cópia começa hoje: o vencimento antigo geraria parcelas atrasadas que a pessoa não pediu.
  const [firstDue, setFirstDue] = useState(edit ? edit.firstDueDate : today)
  const [received, setReceived] = useState('0')
  // Rateio: valor da parte da pessoa por mês, parcelas (vazio = todo mês, sem fim), mês de início e, para encerrar, o último mês.
  const sourceRateio = source?.kind === 'rateio' ? source : undefined
  const [monthly, setMonthly] = useState(sourceRateio ? centsToInput(sourceRateio.monthlyCents ?? sourceRateio.installments[0]?.amountCents ?? 0) : '')
  const [rateioCount, setRateioCount] = useState(sourceRateio && !sourceRateio.recurring ? String(sourceRateio.installmentCount) : '')
  const [startMonth, setStartMonth] = useState<Competence>(edit?.kind === 'rateio' ? competenceOf(edit.firstDueDate) : competenceOf(today))
  const [endMonth, setEndMonth] = useState<string>(edit?.kind === 'rateio' ? (edit.endMonth ?? '') : '')
  const [notes, setNotes] = useState(source?.notes ?? '')
  // Reembolso do cartão pode se referir a uma conta paga com cartão de crédito; o rateio é sempre de uma conta a pagar.
  // O app mostra o gasto real: o que foi pago menos o que a pessoa devolve.
  const bills = useBills(uid).data
  const payments = useRegistry(uid).data.payments
  const [billId, setBillId] = useState(source?.billId ?? '')
  const billOptions = useMemo(() => {
    const shown = kind === 'cartao' ? bills.filter((b) => isCardBill(b, payments) || b.id === source?.billId) : bills
    return [...shown].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [bills, payments, kind, source?.billId])
  const linkedBillId = kind !== 'servico' && billOptions.some((b) => b.id === billId) ? billId : ''
  const linkedBill = bills.find((b) => b.id === linkedBillId)
  const [error, setError] = useState<string | null>(null)

  const sortedPeople = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [people])
  const isNew = !edit && (personChoice === NEW_PERSON || (peopleReady && sortedPeople.length === 0))

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

  const monthlyCents = parseBRLToCents(monthly)
  const rn = Number(rateioCount)
  const rateioCountValid = rateioCount === '' || (Number.isInteger(rn) && rn >= 1 && rn <= MAX_INSTALLMENTS)
  const openEnded = rateioCount === ''

  function validPerson(): string | null {
    if (edit) return null
    if (!isNew && !personChoice) return 'Escolha a pessoa ou cadastre uma nova.'
    if (isNew) {
      if (!name.trim()) return 'Informe o nome da pessoa.'
      if (!isValidPhone(phone)) return 'Telefone inválido. Use DDD e número, por exemplo (11) 91234-5678, ou deixe em branco.'
      if (!isValidEmail(email)) return 'E-mail inválido. Confira ou deixe em branco.'
    }
    return null
  }

  function personInput() {
    return isNew
      ? { name: name.trim(), phone: phoneDigits(phone), email: email.trim(), charges: [], tone }
      : { ...sortedPeople.find((p) => p.id === personChoice)!, id: personChoice }
  }

  function submitRateio() {
    const personError = validPerson()
    if (personError) return setError(personError)
    if (!linkedBill) return setError('Escolha a conta a pagar deste rateio.')
    if (monthlyCents === null || monthlyCents <= 0) return setError('Informe o valor da parte da pessoa por mês. Exemplo: 477,00')
    if (!rateioCountValid) return setError(`O número de parcelas deve ser de 1 a ${MAX_INSTALLMENTS}, ou fique vazio para todo mês.`)
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return setError('Informe o mês de início.')
    const end = openEnded && endMonth ? endMonth : null
    if (end && end < startMonth) return setError('O último mês não pode ser antes do mês de início.')
    const desc = description.trim() || linkedBill.name
    const firstDueDate = dueDateFor(startMonth, linkedBill.dueDay)

    if (edit) {
      const paidUpTo = lastPaidNumber(edit.installments)
      if (!openEnded && rn < paidUpTo) return setError(`Já existe baixa até a parcela ${paidUpTo}. O número de parcelas não pode ser menor que isso.`)
      if (end && paidUpTo > 0) {
        const lastPaid = edit.installments.find((i) => i.number === paidUpTo)!
        if (competenceOf(lastPaid.dueDate) > end) return setError(`Já existe recebimento em ${formatCompetence(competenceOf(lastPaid.dueDate))}. O último mês não pode ser antes disso.`)
      }
      setError(null)
      updateReceivable(
        uid,
        editReceivable(edit, {
          kind,
          description: desc,
          totalCents: openEnded ? edit.totalCents : monthlyCents * rn,
          installmentCount: openEnded ? edit.installmentCount : rn,
          firstDueDate,
          notes: notes.trim(),
          billId: linkedBill.id,
          monthlyCents,
          recurring: openEnded,
          endMonth: end,
        }),
      ).catch(log)
      navigate(`/receber/pessoa/${edit.personId}`)
      return
    }

    const fresh = openEnded
      ? buildRateio(monthlyCents, startMonth, linkedBill.dueDay, { until: addMonths(competenceOf(today), 1), endMonth: end })
      : buildRateio(monthlyCents, startMonth, linkedBill.dueDay, { count: rn })
    const done = Number(received || '0')
    const limit = openEnded ? fresh.length : rn - 1
    if (!Number.isInteger(done) || done < 0 || done > limit) {
      return setError(`${openEnded ? 'Os meses já recebidos' : 'As parcelas já recebidas'} devem ser de 0 a ${limit}.`)
    }
    setError(null)
    const installments = withFirstReceived(fresh, done, today)
    const { personId } = createReceivable(uid, {
      person: personInput(),
      receivable: {
        kind,
        description: desc,
        totalCents: installments.reduce((acc, i) => acc + i.amountCents, 0),
        installmentCount: installments.length,
        firstDueDate,
        installments,
        notes: notes.trim(),
        billId: linkedBill.id,
        monthlyCents,
        recurring: openEnded,
        endMonth: end,
      },
    })
    navigate(`/receber/pessoa/${personId}`)
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (kind === 'rateio') return submitRateio()
    if (!edit) {
      if (!isNew && !personChoice) return setError('Escolha a pessoa ou cadastre uma nova.')
      if (isNew) {
        if (!name.trim()) return setError('Informe o nome da pessoa.')
        if (!isValidPhone(phone)) return setError('Telefone inválido. Use DDD e número, por exemplo (11) 91234-5678, ou deixe em branco.')
        if (!isValidEmail(email)) return setError('E-mail inválido. Confira ou deixe em branco.')
      }
    }
    if (!description.trim()) {
      return setError(kind === 'servico' ? 'Informe qual foi o serviço.' : 'Informe o que foi comprado ou parcelado.')
    }
    if (totalCents === null || totalCents <= 0) return setError('Informe o valor total. Exemplo: 420,00')
    if (!validCount) return setError(`O número de parcelas deve ser de 1 a ${MAX_INSTALLMENTS}.`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return setError('Informe o vencimento da primeira parcela.')

    if (edit) {
      const paidUpTo = lastPaidNumber(edit.installments)
      if (n < paidUpTo) {
        return setError(`Já existe baixa até a parcela ${paidUpTo}. O número de parcelas não pode ser menor que isso.`)
      }
      setError(null)
      updateReceivable(
        uid,
        editReceivable(edit, {
          kind,
          description: description.trim(),
          totalCents,
          installmentCount: n,
          firstDueDate: firstDue,
          notes: notes.trim(),
          billId: linkedBillId || null,
          recurring: false,
          endMonth: null,
        }),
      ).catch(log)
      navigate(`/receber/pessoa/${edit.personId}`)
      return
    }

    const done = Number(received || '0')
    if (!Number.isInteger(done) || done < 0 || done > n - 1) {
      return setError(`As parcelas já recebidas devem ser de 0 a ${n - 1}.`)
    }

    setError(null)
    const installments = withFirstReceived(buildInstallments(totalCents, n, firstDue), done, today)
    const { personId } = createReceivable(uid, {
      person: personInput(),
      receivable: {
        kind,
        description: description.trim(),
        totalCents,
        installmentCount: n,
        firstDueDate: firstDue,
        installments,
        notes: notes.trim(),
        ...(linkedBillId ? { billId: linkedBillId } : {}),
      },
    })
    navigate(`/receber/pessoa/${personId}`)
  }

  const cancelTo = edit ? `/receber/pessoa/${edit.personId}` : listPath(kind)
  const title = receivableFormTitle(kind, {
    editing: Boolean(edit),
    installments: kind === 'rateio' ? (openEnded || !rateioCountValid ? null : rn) : validCount ? n : null,
  })
  const forPerson = edit ? editPerson?.name : isNew ? name.trim() : sortedPeople.find((p) => p.id === personChoice)?.name

  return (
    <main className="page">
      <header className="page-head">
        <h1>{title}</h1>
        <Link className="btn primary cancel-btn" to={cancelTo}>
          <span aria-hidden="true">✕</span> Cancelar
        </Link>
      </header>
      {forPerson && <p className="muted for-person">para {forPerson}</p>}
      {copyOf && (
        <p className="muted copy-note">Cópia de “{copyOf.description}”. As baixas não são copiadas, e nada é salvo até você tocar em Salvar.</p>
      )}
      {copyPerson && <p className="muted copy-note">Cópia do contato de “{copyPerson.name}”. Nada é salvo até você tocar em Salvar.</p>}

      <form className="stack card" onSubmit={onSubmit} noValidate>
        <fieldset className="kind-picker">
          <legend>O que é</legend>
          {RECEIVABLE_KINDS.map((k) => (
            <label key={k} className={`kind-option ${kind === k ? 'selected' : ''}`}>
              <input type="radio" name="tipo" value={k} checked={kind === k} onChange={() => setKind(k)} />
              <span>
                <strong>{KIND_INFO[k].title}</strong>
                <small className="muted">{KIND_INFO[k].hint}</small>
              </span>
            </label>
          ))}
        </fieldset>

        {edit ? (
          <p className="muted">
            Pessoa: <strong>{editPerson?.name ?? '—'}</strong>
          </p>
        ) : (
          sortedPeople.length > 0 && (
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
          )
        )}

        {isNew && (
          <>
            <ContactImport
              onPick={(c) => {
                if (c.name) setName(c.name)
                if (c.phone) setPhone(c.phone)
                if (c.email) setEmail(c.email)
              }}
            />
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
            <label>
              Tom da cobrança
              <select value={tone} onChange={(e) => setTone(e.target.value as MessageTone)}>
                <option value="amigavel">{TONE_LABEL.amigavel} (leve, para amigos e família)</option>
                <option value="profissional">{TONE_LABEL.profissional} (mais formal)</option>
              </select>
            </label>
          </>
        )}

        {kind === 'rateio' && (
          <>
            <label>
              Conta a pagar dividida
              <select value={linkedBillId} onChange={(e) => setBillId(e.target.value)}>
                <option value="">Escolha…</option>
                {billOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.active ? '' : ' (arquivada)'}
                  </option>
                ))}
              </select>
            </label>
            {billOptions.length === 0 && (
              <p className="muted small-note">
                Cadastre primeiro a conta em <Link to="/contas/nova">Nova conta</Link>: o rateio fica sempre ligado a ela.
              </p>
            )}
            {linkedBill && <p className="muted small-note">Vence todo dia {linkedBill.dueDay}, junto com a conta. O app mostra o seu gasto real: a conta menos a parte da pessoa.</p>}
          </>
        )}

        <label>
          {kind === 'servico' ? 'Qual foi o serviço' : kind === 'rateio' ? 'Descrição (opcional)' : 'O que foi'}
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === 'rateio' && linkedBill ? linkedBill.name : KIND_INFO[kind].placeholder}
          />
        </label>

        {kind === 'cartao' && billOptions.length === 0 && bills.length > 0 && (
          <p className="muted small-note">Nenhuma conta a pagar com cartão de crédito para ligar. A forma de pagamento da conta precisa ser cartão.</p>
        )}

        {kind === 'cartao' && billOptions.length > 0 && (
          <>
            <label>
              Refere-se à conta paga com cartão (opcional)
              <select value={linkedBillId} onChange={(e) => setBillId(e.target.value)}>
                <option value="">Nenhuma</option>
                {billOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.active ? '' : ' (arquivada)'}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small-note">
              Se este valor volta de uma conta que você paga (como a fatura do cartão), ligue as duas. O app mostra o seu gasto real: o
              que você pagou menos o que a pessoa devolve.
            </p>
          </>
        )}

        {kind === 'rateio' ? (
          <>
            <div className="row">
              <label>
                Parte da pessoa por mês (R$)
                <MoneyInput value={monthly} onChange={setMonthly} placeholder="477,00" />
              </label>
              <label>
                Nº de parcelas (opcional)
                <input
                  inputMode="numeric"
                  value={rateioCount}
                  onChange={(e) => setRateioCount(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="Sem fim"
                />
              </label>
            </div>
            <p className="muted small-note">
              {openEnded
                ? 'Sem número de parcelas, a parte se repete todo mês até você informar o último mês.'
                : rateioCountValid && monthlyCents
                  ? `${rn} × ${formatBRL(monthlyCents)}, uma por mês.`
                  : 'Informe as parcelas para um rateio com fim.'}
            </p>
            <label>
              Começa em
              <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
            </label>
            {edit && openEnded && (
              <>
                <label>
                  Último mês (para encerrar)
                  <input type="month" value={endMonth} min={startMonth} onChange={(e) => setEndMonth(e.target.value)} />
                </label>
                <p className="muted small-note">Deixe vazio enquanto o rateio continuar. Ao informar, os meses seguintes deixam de ser cobrados.</p>
              </>
            )}
            {edit ? (
              <p className="muted small-note">Os recebimentos já registrados são mantidos.</p>
            ) : (
              <label>
                {openEnded ? 'Meses já recebidos' : 'Parcelas já recebidas'}
                <input inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="0" />
              </label>
            )}
          </>
        ) : (
          <>
        <div className="row">
          <label>
            Valor total (R$)
            <MoneyInput value={total} onChange={setTotal} placeholder="420,00" />
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

        {edit ? (
          <p className="muted small-note">
            As baixas já registradas são mantidas pelo número da parcela. Se mudar o valor, parcelas já recebidas podem
            passar a aparecer como parciais.
          </p>
        ) : (
          <>
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
          </>
        )}
          </>
        )}

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
          {edit ? 'Salvar alterações' : 'Salvar'}
        </button>
        {edit && <CopyButton to={`/receber/nova?copiarCompra=${edit.id}`} />}
      </form>
    </main>
  )
}
