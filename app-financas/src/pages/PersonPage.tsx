import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { ChargeSheet } from '../components/ChargeSheet'
import { ContactImport } from '../components/ContactImport'
import { CopyButton } from '../components/CopyButton'
import { DeleteButton } from '../components/DeleteButton'
import { StatusChip } from '../components/StatusChip'
import { useBills, usePeople, useReceivables, useToday } from '../data/hooks'
import { deleteChargeLog, deletePerson, deleteReceivable, logCharge, setInstallmentPayment, updatePerson } from '../data/store'
import { formatDateBR } from '../domain/dates'
import { useMoney } from '../data/privacy'
import { centsToInput, parseBRLToCents } from '../domain/money'
import { MoneyInput } from '../components/MoneyInput'
import {
  CHANNEL_LABEL,
  KIND_INFO,
  RECEIVABLE_KINDS,
  TONE_LABEL,
  formatPhone,
  installmentRemaining,
  installmentStatus,
  isSettled,
  isValidEmail,
  isValidPhone,
  lastChargeText,
  listPath,
  ofKind,
  personTone,
  phoneDigits,
  summarizePerson,
  summarizeReceivable,
} from '../domain/receivables'
import type { Installment, IsoDate, MessageTone, Person, Receivable, ReceivableKind } from '../domain/types'

const log = (e: unknown) => console.error('Falha ao gravar', e)

export default function PersonPage() {
  const { id } = useParams()
  const uid = useAuth().user!.uid
  const today = useToday()
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  const bills = useBills(uid)

  if (!people.ready || !receivables.ready) {
    return (
      <main className="page">
        <p className="muted center-text">Carregando…</p>
      </main>
    )
  }
  const person = people.data.find((p) => p.id === id)
  if (!person) {
    return (
      <main className="page">
        <p className="error">Pessoa não encontrada.</p>
        <Link className="btn" to="/receber">
          Voltar
        </Link>
      </main>
    )
  }
  const mine = receivables.data.filter((r) => r.personId === person.id)
  return <Detail key={person.id} uid={uid} today={today} person={person} receivables={mine} billNames={new Map(bills.data.map((b) => [b.id, b.name]))} />
}

function Detail({
  uid,
  today,
  person,
  receivables,
  billNames,
}: {
  uid: string
  today: IsoDate
  person: Person
  receivables: Receivable[]
  billNames: ReadonlyMap<string, string>
}) {
  const navigate = useNavigate()
  const [editingContact, setEditingContact] = useState(false)
  const [charging, setCharging] = useState<Receivable[] | null>(null)

  const kinds = RECEIVABLE_KINDS.filter((k) => ofKind(receivables, k).length > 0)
  const first = person.name.split(/\s+/)[0]

  return (
    <main className="page">
      <header className="page-head">
        <h1>{person.name}</h1>
        <Link className="link-btn" to={listPath(kinds[0] ?? 'cartao')}>
          Voltar
        </Link>
      </header>

      <Contact uid={uid} person={person} editing={editingContact} setEditing={setEditingContact} />

      <ChargeHistory uid={uid} person={person} today={today} />

      {kinds.length === 0 ? (
        <div className="empty card">
          <h2>Nenhuma compra desta pessoa</h2>
          <p className="muted">Toque em “Nova compra” para cadastrar o que foi parcelado.</p>
          <div className="actions">
            <Link className="btn primary" to={`/receber/nova?pessoa=${person.id}`}>
              Nova compra
            </Link>
          </div>
          <DeleteButton
            label="Excluir pessoa"
            onConfirm={() => {
              deletePerson(uid, person.id).catch(log)
              navigate('/receber')
            }}
          />
        </div>
      ) : (
        kinds.map((kind, idx) => (
          <KindSection
            key={kind}
            uid={uid}
            today={today}
            kind={kind}
            first={first}
            multiple={kinds.length > 1}
            newPurchasePath={`/receber/nova?pessoa=${person.id}&tipo=${kind}`}
            showNewPurchase={idx === 0}
            receivables={ofKind(receivables, kind)}
            billNames={billNames}
            onCharge={setCharging}
          />
        ))
      )}

      {kinds.length > 0 && (
        <section className="card stack danger-zone" aria-label="Excluir pessoa">
          <h2>Excluir pessoa</h2>
          <p className="muted">
            Apaga {person.name} e {receivables.length === 1 ? 'a compra' : `as ${receivables.length} compras`} dela, com todas as parcelas e o histórico de
            cobranças.
          </p>
          <DeleteButton
            large
            label={`Excluir ${first} e ${receivables.length === 1 ? 'a compra' : 'as compras'}`}
            warning="Isso apaga a pessoa, as compras, as parcelas e o histórico de cobranças. Não dá para desfazer."
            onConfirm={() => {
              deletePerson(
                uid,
                person.id,
                receivables.map((r) => r.id),
              ).catch(log)
              navigate('/receber')
            }}
          />
        </section>
      )}

      {charging && (
        <ChargeSheet
          person={person}
          receivables={charging}
          today={today}
          onClose={() => setCharging(null)}
          onEditContact={() => {
            setCharging(null)
            setEditingContact(true)
          }}
          onCharged={({ channel, totalCents, overdue }) =>
            logCharge(uid, person, { date: today, channel, totalCents, overdue }).catch(log)
          }
        />
      )}
    </main>
  )
}

/** Resumo, cobrança e compras de um tipo (reembolso do cartão ou serviço) de uma pessoa. */
function KindSection({
  uid,
  today,
  kind,
  first,
  multiple,
  newPurchasePath,
  showNewPurchase,
  receivables,
  billNames,
  onCharge,
}: {
  uid: string
  today: IsoDate
  kind: ReceivableKind
  first: string
  multiple: boolean
  newPurchasePath: string
  showNewPurchase: boolean
  receivables: Receivable[]
  billNames: ReadonlyMap<string, string>
  onCharge: (list: Receivable[]) => void
}) {
  const money = useMoney()
  const sorted = useMemo(
    () =>
      [...receivables].sort((a, b) => {
        const sa = summarizeReceivable(a, today)
        const sb = summarizeReceivable(b, today)
        return (
          Number(sb.remainingCents > 0) - Number(sa.remainingCents > 0) ||
          (sa.nextDueDate ?? '9999').localeCompare(sb.nextDueDate ?? '9999')
        )
      }),
    [receivables, today],
  )
  const summary = summarizePerson(receivables, today)
  const title = KIND_INFO[kind].title

  return (
    <section className="stack kind-section" aria-label={title}>
      <h2 className="kind-title">{title}</h2>

      {summary.overdueCount > 0 && (
        <p className="banner banner-danger" role="status">
          {summary.overdueCount === 1 ? '1 parcela atrasada' : `${summary.overdueCount} parcelas atrasadas`}, somando{' '}
          {money(summary.overdueCents)}.
        </p>
      )}

      <div className="summary" role="group" aria-label={`Resumo: ${title}`}>
        <div className="card summary-main tone-recv">
          <span className="muted">Falta receber</span>
          <strong>{money(summary.remainingCents)}</strong>
          <span className="muted">
            {summary.remainingCents === 0
              ? 'Tudo recebido'
              : summary.nextDueDate
                ? `Próxima parcela em ${formatDateBR(summary.nextDueDate)}`
                : ''}
          </span>
        </div>
        <div className="card tone-ok">
          <span className="muted">Já recebido</span>
          <strong>{money(summary.receivedCents)}</strong>
        </div>
        <div className={`card ${summary.overdueCents > 0 ? 'tone-danger' : 'tone-neutral'}`}>
          <span className="muted">
            {summary.overdueCents > 0 && <span aria-hidden="true">⚠ </span>}Em atraso
          </span>
          <strong>{money(summary.overdueCents)}</strong>
        </div>
      </div>

      <div className="actions">
        <button
          className="btn primary"
          disabled={summary.remainingCents <= 0}
          aria-label={multiple ? `Cobrar ${first} (${title.toLowerCase()})` : undefined}
          onClick={() => onCharge(receivables)}
        >
          Cobrar {first}
        </button>
        {showNewPurchase && (
          <Link className="btn" to={newPurchasePath}>
            Nova compra
          </Link>
        )}
      </div>

      {sorted.map((r) => (
        <Purchase key={r.id} uid={uid} today={today} receivable={r} billName={r.billId ? billNames.get(r.billId) : undefined} onCharge={() => onCharge([r])} />
      ))}
    </section>
  )
}

/** Última cobrança e histórico das cobranças feitas a esta pessoa. */
function ChargeHistory({ uid, person, today }: { uid: string; person: Person; today: IsoDate }) {
  const money = useMoney()
  const last = lastChargeText(person.charges, today)
  if (!last) return null
  const list = person.charges.map((c, index) => ({ c, index })).reverse()
  return (
    <details className="card charge-history">
      <summary>
        <span>Histórico de cobranças</span>
        <span className="muted">{last}</span>
      </summary>
      <ul className="list charge-list">
        {list.map(({ c, index }) => (
          <li key={`${c.date}-${index}`}>
            <span>
              {formatDateBR(c.date)} · {CHANNEL_LABEL[c.channel]}
            </span>
            <span className="muted">
              {money(c.totalCents)} · {c.overdue ? 'em atraso' : 'lembrete'}
            </span>
            <DeleteButton label="Excluir" onConfirm={() => deleteChargeLog(uid, person, index).catch(log)} />
          </li>
        ))}
      </ul>
    </details>
  )
}

function Contact({
  uid,
  person,
  editing,
  setEditing,
}: {
  uid: string
  person: Person
  editing: boolean
  setEditing: (v: boolean) => void
}) {
  const [name, setName] = useState(person.name)
  const [phone, setPhone] = useState(person.phone ? formatPhone(person.phone) : '')
  const [email, setEmail] = useState(person.email)
  const [tone, setTone] = useState<MessageTone>(personTone(person))
  const [error, setError] = useState<string | null>(null)

  function save(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) return setError('Informe o nome da pessoa.')
    if (!isValidPhone(phone)) return setError('Telefone inválido. Use DDD e número, por exemplo (11) 91234-5678, ou deixe em branco.')
    if (!isValidEmail(email)) return setError('E-mail inválido. Confira ou deixe em branco.')
    updatePerson(uid, { ...person, name: name.trim(), phone: phoneDigits(phone), email: email.trim(), tone }).catch(log)
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <section className="card stack" aria-label="Contato">
        <div className="sheet-head">
          <h2>Contato</h2>
          <button className="link-btn" onClick={() => setEditing(true)}>
            Editar contato
          </button>
        </div>
        <dl className="facts">
          <div>
            <dt>Telefone / WhatsApp</dt>
            <dd>{person.phone ? formatPhone(person.phone) : <span className="muted">não cadastrado</span>}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{person.email || <span className="muted">não cadastrado</span>}</dd>
          </div>
          <div>
            <dt>Tom da cobrança</dt>
            <dd>{TONE_LABEL[personTone(person)]}</dd>
          </div>
        </dl>
      </section>
    )
  }

  return (
    <form className="card stack" onSubmit={save} aria-label="Editar contato" noValidate>
      <h2>Editar contato</h2>
      <ContactImport
        onPick={(c) => {
          if (c.name) setName(c.name)
          if (c.phone) setPhone(c.phone)
          if (c.email) setEmail(c.email)
        }}
      />
      <label>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} />
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
        <button className="btn primary cancel-btn" type="button" onClick={() => setEditing(false)}>
          <span aria-hidden="true">✕</span> Cancelar
        </button>
      </div>
      <CopyButton to={`/receber/nova?copiarPessoa=${person.id}`} />
    </form>
  )
}

function Purchase({
  uid,
  today,
  receivable,
  billName,
  onCharge,
}: {
  uid: string
  today: IsoDate
  receivable: Receivable
  billName?: string
  onCharge: () => void
}) {
  const money = useMoney()
  const s = summarizeReceivable(receivable, today)
  const pct = s.count === 0 ? 0 : Math.round((s.settledCount / s.count) * 100)
  return (
    <section className="card stack" aria-label={receivable.description}>
      <div className="sheet-head">
        <div>
          <h2>{receivable.description}</h2>
          <p className="muted">
            {s.settledCount} de {s.count} {s.count === 1 ? 'parcela recebida' : 'parcelas recebidas'}
            {s.remainingCents > 0 ? ` · faltam ${money(s.remainingCents)}` : ' · quitada'}
          </p>
        </div>
        <strong>{money(receivable.totalCents)}</strong>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Parcelas recebidas">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {billName && <p className="muted">Refere-se à conta a pagar: {billName}</p>}
      {receivable.notes && <p className="muted">{receivable.notes}</p>}

      <details open={s.remainingCents > 0 && s.count <= 12}>
        <summary>Parcelas</summary>
        <ul className="list parcels">
          {receivable.installments.map((i) => (
            <Parcel key={i.number} uid={uid} today={today} receivable={receivable} installment={i} />
          ))}
        </ul>
      </details>

      <div className="actions">
        {s.remainingCents > 0 && (
          <button className="btn small" onClick={onCharge}>
            Cobrar esta compra
          </button>
        )}
        <Link className="btn small" to={`/receber/compra/${receivable.id}/editar`} aria-label={`Editar compra ${receivable.description}`}>
          Editar
        </Link>
        <DeleteButton label="Excluir compra" onConfirm={() => deleteReceivable(uid, receivable.id).catch(log)} />
      </div>
    </section>
  )
}

function Parcel({ uid, today, receivable, installment: i }: { uid: string; today: IsoDate; receivable: Receivable; installment: Installment }) {
  const money = useMoney()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(centsToInput(i.amountCents))
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)

  const status = installmentStatus(i, today)
  const settled = isSettled(i)
  const label = `Parcela ${i.number} de ${receivable.installmentCount}`

  function quick() {
    setInstallmentPayment(uid, receivable, i.number, { paidAt: today, paidAmountCents: i.amountCents }).catch(log)
  }

  function confirm(ev: FormEvent) {
    ev.preventDefault()
    const cents = parseBRLToCents(amount)
    if (cents === null || cents <= 0) return setError('Informe o valor recebido. Exemplo: 42,00')
    if (!date || date > today) return setError('A data do recebimento não pode ser futura.')
    setInstallmentPayment(uid, receivable, i.number, { paidAt: date, paidAmountCents: cents }).catch(log)
    setError(null)
    setEditing(false)
  }

  return (
    <li className={`row-card parcel status-${status}`}>
      <div className="row-main">
        <span className="row-title">{label}</span>
        <span className="muted">
          Vence {formatDateBR(i.dueDate)}
          {i.paidAt ? ` · recebida em ${formatDateBR(i.paidAt)}` : ''}
        </span>
        <StatusChip status={status} />
      </div>
      <div className="row-side">
        <strong>{money(settled ? (i.paidAmountCents ?? 0) : installmentRemaining(i))}</strong>
        {i.paidAt !== null && !settled && <span className="muted">restante</span>}
        <div className="parcel-actions">
          {i.paidAt !== null && (
            <button
              className="link-btn"
              aria-label={`Desfazer baixa da ${label.toLowerCase()} (${receivable.description})`}
              onClick={() => setInstallmentPayment(uid, receivable, i.number, null).catch(log)}
            >
              Desfazer
            </button>
          )}
          {!settled && (
            <>
              <button className="link-btn" onClick={() => setEditing((v) => !v)}>
                Valor/data
              </button>
              <button className="check-btn labeled" aria-label={`Dar baixa na ${label.toLowerCase()} (${receivable.description})`} onClick={quick}>
                <span aria-hidden="true">✓</span> Dar baixa
              </button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <form className="parcel-form" onSubmit={confirm} aria-label={`Dar baixa na ${label.toLowerCase()}`} noValidate>
          <div className="row">
            <label>
              Valor recebido
              <MoneyInput value={amount} onChange={setAmount} />
            </label>
            <label>
              Data
              <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button className="btn primary small" type="submit">
              Confirmar
            </button>
            <button className="btn small" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </li>
  )
}
