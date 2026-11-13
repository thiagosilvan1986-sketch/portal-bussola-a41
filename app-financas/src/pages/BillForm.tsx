import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useBills, useReceivables, useRegistry, useToday } from '../data/hooks'
import { CopyButton } from '../components/CopyButton'
import { DaySelect } from '../components/DaySelect'
import { DeleteButton } from '../components/DeleteButton'
import { restoreMonth, deleteBill, saveBill } from '../data/store'
import { settleWithin } from '../data/wait'
import { MAX_BILL_INSTALLMENTS, RECURRENCE_LABEL, RECURRENCE_STEP, endCompetence, installmentsUntil } from '../domain/bills'
import { addMonths, competenceOf, formatCompetence } from '../domain/dates'
import { receivablesOfBill } from '../domain/linked'
import { centsToInput, parseBRLToCents } from '../domain/money'
import { MoneyInput } from '../components/MoneyInput'
import { QuickAddSelect } from '../components/QuickAddSelect'
import { createCategory, createPayment } from '../data/quickAdd'
import { alphabetical } from '../domain/text'
import { isFallbackCategory, FALLBACK_CATEGORY, MAX_TEMPLATE_NAME, availableTemplates, copyName, suggestCategory, supplierSuggestions, type Template } from '../domain/registry'
import type { Bill, PaymentMethod, Recurrence, ValueType } from '../domain/types'

export default function BillForm() {
  const { id } = useParams()
  const uid = useAuth().user!.uid
  const bills = useBills(uid)
  const [params] = useSearchParams()
  const copyId = params.get('copiar')

  if (!id && copyId) {
    // "Copiar e criar novo": o cadastro novo já vem preenchido com o da conta copiada. Nada é salvo até tocar em Salvar.
    if (!bills.ready) return <main className="page"><p className="muted center-text">Carregando…</p></main>
    const source = bills.data.find((b) => b.id === copyId)
    return <Editor key={`copia-${copyId}`} initial={null} seed={source ?? null} bills={bills.data} />
  }
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

/** Veio do cadastro de A receber ("+ Nova conta"): ao salvar ou cancelar, volta para lá. Só aceita caminhos de A receber. */
function returnPath(raw: string | null): string | null {
  return raw && raw.startsWith('/receber/') ? raw : null
}

function Editor({ initial, seed = null, bills }: { initial: Bill | null; seed?: Bill | null; bills: Bill[] }) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const back = initial ? null : returnPath(search.get('voltar'))
  const uid = useAuth().user!.uid
  const today = useToday()
  const registry = useRegistry(uid).data
  // Compras a receber que se referem a esta conta: ao excluí-la, elas continuam cadastradas, mas perdem a ligação.
  const receivables = useReceivables(uid).data
  const linkedPurchases = initial ? receivablesOfBill(initial.id, receivables) : []

  // Numa cópia, tudo vem da conta copiada (menos as parcelas pagas e os meses excluídos, que são só dela).
  const base = initial ?? seed
  const [name, setName] = useState(initial ? initial.name : seed ? copyName(seed.name, bills.map((b) => b.name), MAX_TEMPLATE_NAME) : '')
  const [category, setCategory] = useState(base?.category ?? FALLBACK_CATEGORY)
  // Conta nova: o nome de uma conta que a pessoa já tem (ou de um atalho) escolhe a categoria sozinho, até ela mexer na categoria.
  const [categoryTouched, setCategoryTouched] = useState(Boolean(seed))
  const [categorySuggested, setCategorySuggested] = useState(false)
  const [supplier, setSupplier] = useState(base?.supplier ?? '')
  const [valueType, setValueType] = useState<ValueType>(base?.valueType ?? 'fixed')
  const [amount, setAmount] = useState(base ? centsToInput(base.expectedAmountCents) : '')
  const [dueDay, setDueDay] = useState(String(base?.dueDay ?? ''))
  const [recurrence, setRecurrence] = useState<Recurrence>(base?.recurrence ?? 'monthly')
  // A cópia de uma conta parcelada começa neste mês: copiar um financiamento antigo não deve gerar parcelas atrasadas.
  const [startMonth, setStartMonth] = useState(initial ? initial.startMonth : seed ? (seed.installmentCount ? competenceOf(today) : seed.startMonth) : competenceOf(today))
  // Parcelas: o número é a âncora; "Termina em" é calculado a partir dele (ou calcula o número, se a pessoa preencher o fim).
  const [count, setCount] = useState(base?.installmentCount ? String(base.installmentCount) : '')
  const [endDraft, setEndDraft] = useState('')
  const [paidCount, setPaidCount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(base?.paymentMethod ?? registry.payments[0].id)
  const [notes, setNotes] = useState(base?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const skipped = [...(initial?.skippedMonths ?? [])].sort().reverse()
  // Se a conta usa uma categoria ou forma que saiu da lista, ela continua aparecendo para não se perder ao salvar.
  const categories = registry.categories.includes(category) ? registry.categories : [...registry.categories, category]
  const payments = registry.payments.some((p) => p.id === paymentMethod) ? registry.payments : [...registry.payments, { id: paymentMethod, label: paymentMethod }]
  const shortcuts = initial ? [] : availableTemplates(registry.templates, bills)
  const suppliers = supplierSuggestions(registry, bills)

  const startValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)
  const countNumber = Number(count)
  const countValid = count !== '' && Number.isInteger(countNumber) && countNumber >= 1 && countNumber <= MAX_BILL_INSTALLMENTS
  const endValue = countValid && startValid ? endCompetence(startMonth, recurrence, countNumber) : endDraft
  const thisMonth = competenceOf(today)
  // Parcelas que já tinham vencido até hoje (de "Começa em" até o mês atual) e quantas dessas ainda estão em aberto.
  const elapsed = countValid && startValid ? Math.min(countNumber, installmentsUntil(startMonth, thisMonth, recurrence) ?? 0) : 0
  const maxPaid = Math.min(Math.max(countNumber - 1, 0), elapsed)
  const paid = Math.min(Number(paidCount || '0'), maxPaid)
  const elapsedBefore = countValid && startValid ? Math.min(countNumber, installmentsUntil(startMonth, addMonths(thisMonth, -1), recurrence) ?? 0) : 0
  const overdueOnCreate = initial ? 0 : Math.max(0, elapsedBefore - paid)

  function onCountChange(text: string) {
    setCount(text.replace(/\D/g, '').slice(0, 3))
    setEndDraft('')
  }

  function onEndChange(value: string) {
    setEndDraft(value)
    if (!value) return setCount('')
    const k = startValid ? installmentsUntil(startMonth, value, recurrence) : null
    setCount(k !== null && k <= MAX_BILL_INSTALLMENTS ? String(k) : '')
  }

  /** Mudar o começo ou a repetição mantém o número de parcelas e move o fim; se só o fim estava preenchido, recalcula o número. */
  function onScheduleChange(start: string, rec: Recurrence) {
    setStartMonth(start)
    setRecurrence(rec)
    if (!countValid && endDraft && /^\d{4}-(0[1-9]|1[0-2])$/.test(start)) {
      const k = installmentsUntil(start, endDraft, rec)
      if (k !== null && k <= MAX_BILL_INSTALLMENTS) setCount(String(k))
    }
  }

  function onNameChange(text: string) {
    setName(text)
    if (initial) return
    const suggestion = categoryTouched ? null : suggestCategory(registry, bills, text)
    if (suggestion) setCategory(suggestion)
    setCategorySuggested(suggestion !== null)
  }

  function applyTemplate(t: Template) {
    setCategoryTouched(false)
    setCategorySuggested(false)
    setName(t.name)
    setCategory(registry.categories.includes(t.category) ? t.category : FALLBACK_CATEGORY)
    setValueType(t.valueType)
    setRecurrence(t.recurrence)
    setCount(t.installmentCount ? String(t.installmentCount) : '')
    setEndDraft('')
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
    if (dueDay === '') return setError('Escolha o dia do vencimento.')
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError('O dia de vencimento deve ser de 1 a 31.')
    if (!startValid) return setError('Informe o mês de início.')
    if (count !== '' && !countValid) return setError(`O número de parcelas deve ser de 1 a ${MAX_BILL_INSTALLMENTS}.`)
    if (count === '' && endDraft) return setError('O mês em que a conta termina não pode ser antes do mês em que ela começa.')

    setError(null)
    setSaving(true)
    try {
      const savedId = await saveBill(
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
          installmentCount: countValid ? countNumber : null,
        },
        today,
        initial ? {} : { paidInstallments: paid },
      )
      if (back) navigate(`${back}${back.includes('?') ? '&' : '?'}conta=${encodeURIComponent(savedId)}`)
      else navigate('/contas')
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
        <Link className="btn primary cancel-btn" to={back ?? '/contas'}>
          <span aria-hidden="true">✕</span> Cancelar
        </Link>
      </header>

      {seed && <p className="muted copy-note">Cópia de “{seed.name}”. Nada é salvo até você tocar em Salvar.</p>}

      {!initial && !seed && (
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
          <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Ex.: Energia elétrica" required />
        </label>

        <div className="row">
          <label>
            Valor {valueType === 'fixed' ? 'fixo' : 'estimado'}
            <MoneyInput value={amount} onChange={setAmount} placeholder="0,00" required />
          </label>
          <label>
            Dia do vencimento
            <DaySelect value={dueDay} onChange={setDueDay} emptyLabel="Escolha o dia" required />
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
            <select value={recurrence} onChange={(e) => onScheduleChange(startMonth, e.target.value as Recurrence)}>
              {Object.entries(RECURRENCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Começa em
            <input type="month" value={startMonth} onChange={(e) => onScheduleChange(e.target.value, recurrence)} required />
          </label>
        </div>

        <div className="row">
          <label>
            Número de parcelas (opcional)
            <input inputMode="numeric" value={count} onChange={(e) => onCountChange(e.target.value)} placeholder="Sem fim" />
          </label>
          <label>
            Termina em (opcional)
            <input type="month" value={endValue} onChange={(e) => onEndChange(e.target.value)} />
          </label>
        </div>
        {count === '' && !endDraft && <p className="muted small-note">Sem número de parcelas, a conta se repete sem parar. Para uma conta com fim, informe as parcelas ou o mês em que termina.</p>}
        {count === '' && endDraft && <p className="error small-note">O mês em que a conta termina não pode ser antes do mês em que ela começa.</p>}
        {countValid && endDraft && endDraft !== endValue && (
          <p className="muted small-note">
            A conta repete a cada {RECURRENCE_STEP[recurrence]} meses, então a última parcela cai em {formatCompetence(endValue)}.
          </p>
        )}

        {!initial && countValid && maxPaid >= 1 && (
          <>
            <label>
              Parcelas já pagas
              <input
                inputMode="numeric"
                value={paidCount}
                onChange={(e) => setPaidCount(String(Math.min(Number(e.target.value.replace(/\D/g, '').slice(0, 3) || '0'), maxPaid)))}
                placeholder="0"
              />
            </label>
            <p className="muted small-note">Se a conta já está em andamento, informe quantas parcelas você já pagou.</p>
          </>
        )}
        {overdueOnCreate > 0 && (
          <p className="muted small-note">
            {overdueOnCreate === 1
              ? '1 parcela já venceu e não foi paga: ela entra como atrasada.'
              : `${overdueOnCreate} parcelas já venceram e não foram pagas: elas entram como atrasadas.`}
          </p>
        )}

        <div className="row">
          <QuickAddSelect
            label="Categoria"
            value={category}
            options={alphabetical(categories, (c) => c, isFallbackCategory).map((c) => ({ value: c, label: c }))}
            onChange={(c) => {
              setCategory(c)
              setCategoryTouched(true)
              setCategorySuggested(false)
            }}
            newLabel="+ Nova categoria"
            inputLabel="Nome da nova categoria"
            placeholder="Ex.: Academia"
            onCreate={(name) => createCategory(uid, registry, name)}
          />
          <QuickAddSelect
            label="Forma de pagamento"
            value={paymentMethod}
            options={alphabetical(payments, (p) => p.label).map((p) => ({ value: p.id, label: p.label }))}
            onChange={(v) => setPaymentMethod(v as PaymentMethod)}
            newLabel="+ Nova forma de pagamento"
            inputLabel="Nome da nova forma"
            placeholder="Ex.: Cartão Nubank"
            onCreate={(name) => createPayment(uid, registry, name)}
          />
        </div>
        {categorySuggested && <p className="muted small-note">Categoria sugerida pelo nome. Se não for essa, é só trocar.</p>}

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

        {initial && <CopyButton to={`/contas/nova?copiar=${initial.id}`} />}

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
          {linkedPurchases.length > 0 && (
            <p className="muted">
              {linkedPurchases.length === 1 ? 'Uma compra a receber se refere' : `${linkedPurchases.length} compras a receber se referem`} a esta conta (
              {linkedPurchases.map((r) => r.description).join(', ')}). {linkedPurchases.length === 1 ? 'Ela continua cadastrada' : 'Elas continuam cadastradas'},
              mas {linkedPurchases.length === 1 ? 'perde' : 'perdem'} a ligação e o cálculo do gasto real.
            </p>
          )}
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
