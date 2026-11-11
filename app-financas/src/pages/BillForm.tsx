import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useBills, useRegistry, useToday } from '../data/hooks'
import { DeleteButton } from '../components/DeleteButton'
import { restoreMonth, deleteBill, saveBill } from '../data/store'
import { settleWithin } from '../data/wait'
import { RECURRENCE_LABEL } from '../domain/bills'
import { competenceOf, formatCompetence } from '../domain/dates'
import { centsToInput, parseBRLToCents } from '../domain/money'
import { FALLBACK_CATEGORY, availableTemplates, supplierSuggestions, type Template } from '../domain/registry'
import type { Bill, PaymentMethod, Recurrence, ValueType } from '../domain/types'

export default function BillForm() {
  const { id } = useParams()
  const uid = useAuth().user!.uid
  const bills = useBills(uid)

  if (!id) return <Editor initial={null} bills={bills.data} />
  if (!bills.ready) return <main className="page"><p className="muted center-text">Carregando…</p></main>
  const bill = bills.data.find((b) => b.id === id)
  if (!bill) {
    return (
      <main className="page">
        <p className="error">Conta não encontrada.</p>
        <Link className="btn" to="/contas">
          Voltar
        </Link>
      </main>
    )
  }
  return <Editor key={bill.id} initial={bill} bills={bills.data} />
}

function Editor({ initial, bills }: { initial: Bill | null; bills: Bill[] }) {
  const navigate = useNavigate()
  const uid = useAuth().user!.uid
  const today = useToday()
  const registry = useRegistry(uid).data

  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? FALLBACK_CATEGORY)
  const [supplier, setSupplier] = useState(initial?.supplier ?? '')
  const [valueType, setValueType] = useState<ValueType>(initial?.valueType ?? 'fixed')
  const [amount, setAmount] = useState(initial ? centsToInput(initial.expectedAmountCents) : '')
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? ''))
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? 'monthly')
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? competenceOf(today))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? registry.payments[0].id)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const skipped = [...(initial?.skippedMonths ?? [])].sort().reverse()
  // Se a conta usa uma categoria ou forma que saiu da lista, ela continua aparecendo para não se perder ao salvar.
  const categories = registry.categories.includes(category) ? registry.categories : [...registry.categories, category]
  const payments = registry.payments.some((p) => p.id === paymentMethod) ? registry.payments : [...registry.payments, { id: paymentMethod, label: paymentMethod }]
  const shortcuts = initial ? [] : availableTemplates(registry.templates, bills)
  const suppliers = supplierSuggestions(registry, bills)

  function applyTemplate(t: Template) {
    setName(t.name)
    setCategory(registry.categories.includes(t.category) ? t.category : FALLBACK_CATEGORY)
    setValueType(t.valueType)
    setRecurrence(t.recurrence)
    setPaymentMethod(registry.payments.some((p) => p.id === t.paymentMethod) ? t.paymentMethod : registry.payments[0].id)
    setSupplier(t.supplier)
    if (t.amountCents > 0) setAmount(centsToInput(t.amountCents))
    if (t.dueDay !== null) setDueDay(String(t.dueDay))
  }

  async function persist(active: boolean) {
    const cents = parseBRLToCents(amount)
    const day = Number(dueDay)
    if (!name.trim()) return setError('Informe o nome da conta.')
    if (cents === null) return setError('Informe um valor válido. Exemplo: 238,40')
    if (valueType === 'fixed' && cents === 0) return setError('Para valor fixo, informe um valor maior que zero.')
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError('O dia de vencimento deve ser de 1 a 31.')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) return setError('Informe o mês de início.')

    setError(null)
    setSaving(true)
    try {
      await saveBill(
        uid,
        {
          id: initial?.id,
          name: name.trim(),
          category,
          supplier: supplier.trim(),
          valueType,
          expectedAmountCents: cents,
          dueDay: day,
          recurrence,
          startMonth,
          paymentMethod,
          notes: notes.trim(),
          active,
        },
        today,
      )
      navigate('/contas')
    } catch (e) {
      console.error(e)
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  async function remove() {
    if (!initial) return
    setError(null)
    setSaving(true)
    try {
      await settleWithin(deleteBill(uid, initial.id))
      navigate('/contas')
    } catch (e) {
      console.error(e)
      setError('Não foi possível excluir. Tente de novo.')
      setSaving(false)
    }
  }

  function restore(competence: string) {
    if (!initial) return
    restoreMonth(uid, initial.id, competence).catch((e) => console.error('Falha ao restaurar o mês', e))
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    void persist(initial?.active ?? true)
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>{initial ? 'Editar conta' : 'Nova conta'}</h1>
        <Link className="link-btn" to="/contas">
          Cancelar
        </Link>
      </header>

      {!initial && (
        <div className="chips chips-scroll" role="group" aria-label="Atalhos">
          {shortcuts.map((t) => (
            <button key={t.id} type="button" className="chip-btn" onClick={() => applyTemplate(t)}>
              {t.name}
            </button>
          ))}
          <Link className="chip-btn chip-link" to="/cadastros/atalhos">
            Meus atalhos
          </Link>
        </div>
      )}

      <form className="stack card" onSubmit={onSubmit}>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Energia elétrica" required />
        </label>

        <div className="row">
          <label>
            Valor {valueType === 'fixed' ? 'fixo' : 'estimado'}
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
          </label>
          <label>
            Dia do vencimento
            <input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ex.: 15" required />
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
            Começa em
            <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />
          </label>
        </div>

        <div className="row">
          <label>
            Categoria
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Forma de pagamento
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Fornecedor (opcional)
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="bill-suppliers" placeholder="Ex.: Enel" />
          <datalist id="bill-suppliers">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label>
          Observações
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>

        {initial && (
          <button type="button" className="btn" disabled={saving} onClick={() => void persist(!initial.active)}>
            {initial.active ? 'Arquivar conta (para de gerar lançamentos)' : 'Reativar conta'}
          </button>
        )}
      </form>

      {initial && skipped.length > 0 && (
        <section className="card stack" aria-label="Meses excluídos">
          <h2>Meses excluídos</h2>
          <p className="muted">O app não cria o lançamento destes meses. Restaure para ele voltar.</p>
          <ul className="list">
            {skipped.map((c) => (
              <li key={c} className="skipped-month">
                <span>{formatCompetence(c)}</span>
                <button type="button" className="btn small" onClick={() => restore(c)}>
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {initial && (
        <section className="card stack danger-zone" aria-label="Excluir conta">
          <h2>Excluir conta</h2>
          <p className="muted">Apaga a conta e todos os lançamentos dela, inclusive os já pagos. Para só parar de gerar, arquive.</p>
          <DeleteButton
            large
            label="Excluir conta"
            warning="Isso apaga a conta e todo o histórico de pagamentos dela. Não dá para desfazer."
            onConfirm={() => void remove()}
          />
        </section>
      )}
    </main>
  )
}
