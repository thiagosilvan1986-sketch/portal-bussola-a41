import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { CopyButton } from '../components/CopyButton'
import { DaySelect } from '../components/DaySelect'
import { DeleteButton } from '../components/DeleteButton'
import { useBills, useRegistry } from '../data/hooks'
import { saveRegistry } from '../data/store'
import { settleWithin } from '../data/wait'
import { MAX_BILL_INSTALLMENTS, RECURRENCE_LABEL } from '../domain/bills'
import { centsToInput, parseBRLToCents } from '../domain/money'
import { MoneyInput } from '../components/MoneyInput'
import {
  FALLBACK_CATEGORY,
  MAX_TEMPLATE_NAME,
  copyName,
  removeTemplate,
  saveTemplate,
  supplierSuggestions,
  type Registry,
  type Template,
} from '../domain/registry'
import type { PaymentMethod, Recurrence, ValueType } from '../domain/types'

export default function ShortcutForm() {
  const { id } = useParams()
  const uid = useAuth().user!.uid
  const registry = useRegistry(uid)
  const bills = useBills(uid)
  const [params] = useSearchParams()
  const copyId = id ? null : params.get('copiar')

  if (!registry.ready) return <main className="page"><p className="muted center-text">Carregando seus cadastros…</p></main>
  const found = id ? registry.data.templates.find((t) => t.id === id) : undefined
  if (id && !found) {
    return (
      <main className="page">
        <p className="error">Atalho não encontrado.</p>
        <Link className="btn" to="/cadastros/atalhos">
          Voltar
        </Link>
      </main>
    )
  }
  const seed = copyId ? (registry.data.templates.find((t) => t.id === copyId) ?? null) : null
  return (
    <Editor
      key={found?.id ?? (seed ? `copia-${seed.id}` : 'novo')}
      uid={uid}
      reg={registry.data}
      initial={found ?? null}
      seed={seed}
      suppliers={supplierSuggestions(registry.data, bills.data)}
    />
  )
}

function Editor({
  uid,
  reg,
  initial,
  seed,
  suppliers,
}: {
  uid: string
  reg: Registry
  initial: Template | null
  /** "Copiar e criar novo": o atalho novo começa com os dados deste. */
  seed: Template | null
  suppliers: string[]
}) {
  const navigate = useNavigate()
  const base = initial ?? seed
  const [name, setName] = useState(initial ? initial.name : seed ? copyName(seed.name, reg.templates.map((t) => t.name), MAX_TEMPLATE_NAME) : '')
  const [category, setCategory] = useState(base?.category ?? FALLBACK_CATEGORY)
  const [amount, setAmount] = useState(base && base.amountCents > 0 ? centsToInput(base.amountCents) : '')
  const [dueDay, setDueDay] = useState(base?.dueDay ? String(base.dueDay) : '')
  const [valueType, setValueType] = useState<ValueType>(base?.valueType ?? 'fixed')
  const [recurrence, setRecurrence] = useState<Recurrence>(base?.recurrence ?? 'monthly')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(base?.paymentMethod ?? reg.payments[0].id)
  const [supplier, setSupplier] = useState(base?.supplier ?? '')
  const [count, setCount] = useState(base?.installmentCount ? String(base.installmentCount) : '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function write(next: Registry) {
    setSaving(true)
    setError(null)
    try {
      await settleWithin(saveRegistry(uid, next))
      navigate('/cadastros/atalhos')
    } catch (e) {
      console.error(e)
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const cents = amount.trim() === '' ? 0 : parseBRLToCents(amount)
    if (cents === null) return setError('Informe um valor válido. Exemplo: 238,40')
    if (dueDay !== '' && (Number(dueDay) < 1 || Number(dueDay) > 31)) return setError('O dia de vencimento deve ser de 1 a 31.')
    if (count !== '' && (Number(count) < 1 || Number(count) > MAX_BILL_INSTALLMENTS)) {
      return setError(`O número de parcelas deve ser de 1 a ${MAX_BILL_INSTALLMENTS}.`)
    }
    const result = saveTemplate(reg, {
      id: initial?.id,
      name,
      category,
      amountCents: cents,
      dueDay: dueDay === '' ? null : Number(dueDay),
      recurrence,
      valueType,
      paymentMethod,
      supplier,
      installmentCount: count === '' ? null : Number(count),
    })
    if (!result.ok) return setError(result.error)
    void write(result.value)
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>{initial ? 'Editar atalho' : 'Novo atalho'}</h1>
        <Link className="btn primary cancel-btn" to="/cadastros/atalhos">
          <span aria-hidden="true">✕</span> Cancelar
        </Link>
      </header>
      {seed && <p className="muted copy-note">Cópia de “{seed.name}”. Nada é salvo até você tocar em Salvar atalho.</p>}
      <p className="muted">Preencha só o que sempre se repete. Valor e dia são opcionais e podem ser ajustados na hora de cadastrar a conta.</p>

      <form className="stack card" onSubmit={onSubmit}>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Condomínio" maxLength={60} required />
        </label>

        <div className="row">
          <label>
            Valor (opcional)
            <MoneyInput value={amount} onChange={setAmount} placeholder="0,00" />
          </label>
          <label>
            Dia do vencimento (opcional)
            <DaySelect value={dueDay} onChange={setDueDay} emptyLabel="Sem dia fixo" />
          </label>
        </div>

        <label>
          Tipo de valor
          <select value={valueType} onChange={(e) => setValueType(e.target.value as ValueType)}>
            <option value="fixed">Fixo (sempre o mesmo)</option>
            <option value="variable">Variável (estimado, muda todo mês)</option>
          </select>
        </label>

        <div className="row">
          <label>
            Repete
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {Object.entries(RECURRENCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Forma de pagamento
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {reg.payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Número de parcelas (opcional)
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Sem fim" />
        </label>
        <p className="muted small-note">Útil para financiamento, consórcio ou empréstimo. Deixe em branco se a conta não tem fim.</p>

        <label>
          Categoria
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {reg.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>

        <label>
          Fornecedor (opcional)
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="shortcut-suppliers" placeholder="Ex.: Enel" maxLength={60} />
          <datalist id="shortcut-suppliers">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar atalho'}
        </button>
        {initial && <CopyButton to={`/cadastros/atalhos/novo?copiar=${initial.id}`} />}
      </form>

      {initial && (
        <section className="card stack danger-zone" aria-label="Excluir atalho">
          <h2>Excluir atalho</h2>
          <p className="muted">Tira só o atalho da lista. As contas que você já cadastrou não mudam.</p>
          <DeleteButton
            large
            label="Excluir atalho"
            warning="O atalho some de “Nova conta”. Você pode recuperar os padrões depois."
            onConfirm={() => void write(removeTemplate(reg, initial.id))}
          />
        </section>
      )}
    </main>
  )
}
