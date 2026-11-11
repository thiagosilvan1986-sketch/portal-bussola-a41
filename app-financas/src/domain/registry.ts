import { MAX_BILL_INSTALLMENTS } from './bills'
import { simplify } from './text'
import type { Bill, PaymentMethod, Recurrence, ValueType } from './types'

/**
 * Cadastros do usuário: categorias, formas de pagamento, atalhos de conta e fornecedores.
 * Tudo aqui é função pura. Enquanto a pessoa não muda nada, valem os padrões (`defaultRegistry`).
 */

/** Categoria padrão: é para onde vai o que não tem lugar. Por isso não pode ser renomeada nem excluída. */
export const FALLBACK_CATEGORY = 'Outros'
export const MAX_NAME = 40
export const MAX_TEMPLATE_NAME = 60

export interface PaymentOption {
  id: PaymentMethod
  label: string
}

/** Modelo de conta (o "atalho" da tela Nova conta). Valor 0 e dia null significam "não preenchido". */
export interface Template {
  id: string
  name: string
  category: string
  amountCents: number
  dueDay: number | null
  recurrence: Recurrence
  valueType: ValueType
  paymentMethod: PaymentMethod
  supplier: string
  /** Quantas parcelas a conta criada com este atalho já traz; ausente = sem fim. */
  installmentCount?: number
}

export interface Registry {
  categories: string[]
  payments: PaymentOption[]
  templates: Template[]
  suppliers: string[]
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = (error: string): Result<never> => ({ ok: false, error })

/* ---------- Padrões ---------- */

const DEFAULT_CATEGORIES = [
  'Moradia',
  'Contas de consumo',
  'Internet e telefonia',
  'Cartão de crédito',
  'Educação',
  'Saúde',
  'Seguros',
  'Assinaturas',
  'Impostos',
  'Transporte',
  'Financiamentos e empréstimos',
  'Pets',
  'Lazer',
  FALLBACK_CATEGORY,
]

const DEFAULT_PAYMENTS: PaymentOption[] = [
  { id: 'boleto', label: 'Boleto' },
  { id: 'debito_automatico', label: 'Débito automático' },
  { id: 'pix', label: 'PIX' },
  { id: 'cartao', label: 'Cartão' },
]

type TemplateExtra = Partial<Pick<Template, 'recurrence' | 'valueType' | 'paymentMethod'>>

const template = (name: string, category: string, extra: TemplateExtra = {}): Template => ({
  id: `padrao-${simplify(name)}`,
  name,
  category,
  amountCents: 0,
  dueDay: null,
  recurrence: 'monthly',
  valueType: 'fixed',
  paymentMethod: 'boleto',
  supplier: '',
  ...extra,
})

const VARIABLE: TemplateExtra = { valueType: 'variable' }

function defaultTemplates(): Template[] {
  return [
    template('Energia elétrica', 'Contas de consumo', VARIABLE),
    template('Água e esgoto', 'Contas de consumo', VARIABLE),
    template('Gás', 'Contas de consumo', VARIABLE),
    template('Internet', 'Internet e telefonia'),
    template('Celular', 'Internet e telefonia'),
    template('Aluguel', 'Moradia'),
    template('Condomínio', 'Moradia'),
    template('Financiamento do imóvel', 'Moradia'),
    template('Diarista', 'Moradia', { paymentMethod: 'pix' }),
    template('Cartão de crédito', 'Cartão de crédito', VARIABLE),
    template('Plano de saúde', 'Saúde'),
    template('Plano odontológico', 'Saúde'),
    template('Escola', 'Educação'),
    template('Faculdade ou curso', 'Educação'),
    template('Idiomas', 'Educação'),
    template('Seguro residencial', 'Seguros'),
    template('Streaming', 'Assinaturas', { paymentMethod: 'cartao' }),
    template('TV por assinatura', 'Assinaturas'),
    template('Academia', 'Assinaturas'),
    template('IPTU', 'Impostos'),
    template('DAS do MEI', 'Impostos'),
    template('Imposto de Renda (cota)', 'Impostos'),
    template('IPVA', 'Transporte', { recurrence: 'yearly' }),
    template('Seguro do carro', 'Transporte'),
    template('Parcela do carro', 'Transporte'),
    template('Estacionamento', 'Transporte'),
    template('Consórcio', 'Financiamentos e empréstimos'),
    template('Empréstimo', 'Financiamentos e empréstimos'),
    template('Pet', 'Pets'),
    template('Previdência privada', FALLBACK_CATEGORY),
    template('Contador', FALLBACK_CATEGORY),
  ]
}

/** Cadastros de quem ainda não mudou nada. Devolve uma cópia nova a cada chamada. */
export function defaultRegistry(): Registry {
  return {
    categories: [...DEFAULT_CATEGORIES],
    payments: DEFAULT_PAYMENTS.map((p) => ({ ...p })),
    templates: defaultTemplates(),
    suppliers: [],
  }
}

/* ---------- Leitura segura do que veio do banco ---------- */

const RECURRENCES: Recurrence[] = ['monthly', 'bimonthly', 'quarterly', 'yearly']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (k === '' || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Aceita qualquer coisa que venha do banco e devolve cadastros válidos.
 * Campo ausente vale o padrão; lista vazia salva de propósito (ex.: nenhum atalho) continua vazia.
 */
export function normalizeRegistry(raw: unknown): Registry {
  const base = defaultRegistry()
  if (!isObject(raw)) return base

  let categories = base.categories
  if (Array.isArray(raw.categories)) {
    categories = uniqueBy(
      raw.categories.map((c) => text(c, MAX_NAME)),
      simplify,
    )
    if (!categories.some((c) => simplify(c) === simplify(FALLBACK_CATEGORY))) categories.push(FALLBACK_CATEGORY)
  }

  let payments = base.payments
  if (Array.isArray(raw.payments)) {
    const read = raw.payments
      .filter(isObject)
      .map((p) => ({ id: text(p.id, 60), label: text(p.label, MAX_NAME) }))
      .filter((p) => p.id !== '' && p.label !== '')
    const clean = uniqueBy(read, (p) => p.id)
    payments = clean.length > 0 ? clean : base.payments
  }

  let suppliers = base.suppliers
  if (Array.isArray(raw.suppliers)) {
    suppliers = uniqueBy(
      raw.suppliers.map((s) => text(s, MAX_NAME)),
      simplify,
    )
  }

  let templates = base.templates
  if (Array.isArray(raw.templates)) {
    const fallbackPayment = payments[0].id
    const read: Template[] = raw.templates.filter(isObject).map((t) => {
      const day = typeof t.dueDay === 'number' && Number.isInteger(t.dueDay) && t.dueDay >= 1 && t.dueDay <= 31 ? t.dueDay : null
      const cents = typeof t.amountCents === 'number' && Number.isInteger(t.amountCents) && t.amountCents > 0 ? t.amountCents : 0
      const category = text(t.category, MAX_NAME)
      const payment = text(t.paymentMethod, 60)
      const parcelas = typeof t.installmentCount === 'number' && Number.isInteger(t.installmentCount) && t.installmentCount >= 1 && t.installmentCount <= MAX_BILL_INSTALLMENTS ? t.installmentCount : null
      return {
        id: text(t.id, 60),
        name: text(t.name, MAX_TEMPLATE_NAME),
        category: categories.includes(category) ? category : FALLBACK_CATEGORY,
        amountCents: cents,
        dueDay: day,
        recurrence: RECURRENCES.includes(t.recurrence as Recurrence) ? (t.recurrence as Recurrence) : 'monthly',
        valueType: t.valueType === 'variable' ? 'variable' : 'fixed',
        paymentMethod: payments.some((p) => p.id === payment) ? payment : fallbackPayment,
        supplier: text(t.supplier, MAX_NAME),
        ...(parcelas !== null ? { installmentCount: parcelas } : {}),
      }
    })
    templates = uniqueBy(
      read.filter((t) => t.name !== ''),
      (t) => t.id,
    )
  }

  return { categories, payments, templates, suppliers }
}

/* ---------- Validação de nomes ---------- */

function checkName(raw: string, others: string[], max = MAX_NAME): Result<string> {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name === '') return fail('Escreva um nome.')
  if (simplify(name) === '') return fail('Use letras ou números no nome.')
  if (name.length > max) return fail(`Use até ${max} letras.`)
  if (others.some((o) => simplify(o) === simplify(name))) return fail(`Já existe “${name}”.`)
  return ok(name)
}

const withoutItem = (list: string[], item: string) => list.filter((x) => x !== item)

/**
 * Nome para a cópia de um cadastro: "Moradia (cópia)", depois "Moradia (cópia 2)" e assim por diante.
 * Copiar uma cópia não empilha "(cópia) (cópia)", e o nome original é cortado se não couber no limite.
 */
export function copyName(label: string, taken: string[], max = MAX_NAME): string {
  const base = label.replace(/\s*\(cópia(?: \d+)?\)\s*$/, '').trim() || label
  const used = new Set(taken.map(simplify))
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (cópia)' : ` (cópia ${n})`
    const candidate = `${base.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`
    if (!used.has(simplify(candidate))) return candidate
  }
}

/* ---------- Categorias ---------- */

export const isFallbackCategory = (name: string) => simplify(name) === simplify(FALLBACK_CATEGORY)

export function addCategory(reg: Registry, raw: string): Result<Registry> {
  const name = checkName(raw, reg.categories)
  if (!name.ok) return name
  // Novas categorias entram antes de "Outros", que fica sempre por último.
  const rest = reg.categories.filter((c) => !isFallbackCategory(c))
  const fallback = reg.categories.filter(isFallbackCategory)
  return ok({ ...reg, categories: [...rest, name.value, ...fallback] })
}

export function renameCategory(reg: Registry, from: string, raw: string): Result<Registry> {
  if (!reg.categories.includes(from)) return fail('Essa categoria não existe mais.')
  if (isFallbackCategory(from)) return fail(`“${FALLBACK_CATEGORY}” é a categoria padrão e não pode ser renomeada.`)
  const name = checkName(raw, withoutItem(reg.categories, from))
  if (!name.ok) return name
  return ok({
    ...reg,
    categories: reg.categories.map((c) => (c === from ? name.value : c)),
    templates: reg.templates.map((t) => (t.category === from ? { ...t, category: name.value } : t)),
  })
}

export function removeCategory(reg: Registry, name: string, moveTo: string): Result<Registry> {
  if (!reg.categories.includes(name)) return fail('Essa categoria não existe mais.')
  if (isFallbackCategory(name)) return fail(`“${FALLBACK_CATEGORY}” é a categoria padrão e não pode ser excluída.`)
  if (moveTo === name || !reg.categories.includes(moveTo)) return fail('Escolha para qual categoria mover.')
  return ok({
    ...reg,
    categories: withoutItem(reg.categories, name),
    templates: reg.templates.map((t) => (t.category === name ? { ...t, category: moveTo } : t)),
  })
}

/* ---------- Formas de pagamento ---------- */

export function addPayment(reg: Registry, raw: string): Result<Registry> {
  const label = checkName(
    raw,
    reg.payments.map((p) => p.label),
  )
  if (!label.ok) return label
  const taken = new Set(reg.payments.map((p) => p.id))
  const slug = `p_${simplify(label.value)}`
  let id = slug
  for (let n = 2; taken.has(id); n++) id = `${slug}_${n}`
  return ok({ ...reg, payments: [...reg.payments, { id, label: label.value }] })
}

export function renamePayment(reg: Registry, id: string, raw: string): Result<Registry> {
  if (!reg.payments.some((p) => p.id === id)) return fail('Essa forma de pagamento não existe mais.')
  const label = checkName(
    raw,
    reg.payments.filter((p) => p.id !== id).map((p) => p.label),
  )
  if (!label.ok) return label
  return ok({ ...reg, payments: reg.payments.map((p) => (p.id === id ? { ...p, label: label.value } : p)) })
}

export function removePayment(reg: Registry, id: string, moveTo: string): Result<Registry> {
  if (!reg.payments.some((p) => p.id === id)) return fail('Essa forma de pagamento não existe mais.')
  if (reg.payments.length <= 1) return fail('Precisa sobrar pelo menos uma forma de pagamento.')
  if (moveTo === id || !reg.payments.some((p) => p.id === moveTo)) return fail('Escolha para qual forma mover.')
  return ok({
    ...reg,
    payments: reg.payments.filter((p) => p.id !== id),
    templates: reg.templates.map((t) => (t.paymentMethod === id ? { ...t, paymentMethod: moveTo } : t)),
  })
}

/** Nome da forma de pagamento; se ela não existir mais, mostra o próprio código. */
export function paymentLabel(reg: Registry, id: PaymentMethod): string {
  return reg.payments.find((p) => p.id === id)?.label ?? id
}

/* ---------- Fornecedores ---------- */

export function addSupplier(reg: Registry, raw: string): Result<Registry> {
  const name = checkName(raw, reg.suppliers)
  if (!name.ok) return name
  return ok({ ...reg, suppliers: [...reg.suppliers, name.value] })
}

export function renameSupplier(reg: Registry, from: string, raw: string): Result<Registry> {
  if (!reg.suppliers.includes(from)) return fail('Esse fornecedor não existe mais.')
  const name = checkName(raw, withoutItem(reg.suppliers, from))
  if (!name.ok) return name
  return ok({
    ...reg,
    suppliers: reg.suppliers.map((s) => (s === from ? name.value : s)),
    templates: reg.templates.map((t) => (t.supplier === from ? { ...t, supplier: name.value } : t)),
  })
}

export function removeSupplier(reg: Registry, name: string): Result<Registry> {
  if (!reg.suppliers.includes(name)) return fail('Esse fornecedor não existe mais.')
  return ok({ ...reg, suppliers: withoutItem(reg.suppliers, name) })
}

/** Nomes para sugerir no campo Fornecedor: os cadastrados e os já usados em contas, sem repetir. */
export function supplierSuggestions(reg: Registry, bills: Pick<Bill, 'supplier'>[]): string[] {
  const all = [...reg.suppliers, ...bills.map((b) => b.supplier.trim())]
  return uniqueBy(all, simplify).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/* ---------- Atalhos de conta ---------- */

export interface TemplateInput {
  id?: string
  name: string
  category: string
  amountCents: number
  dueDay: number | null
  recurrence: Recurrence
  valueType: ValueType
  paymentMethod: PaymentMethod
  supplier: string
  installmentCount?: number | null
}

function newTemplateId(taken: Set<string>): string {
  let id: string
  do {
    id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  } while (taken.has(id))
  return id
}

/** Cria o atalho (sem `id`) ou atualiza o que tem esse `id`. */
export function saveTemplate(reg: Registry, input: TemplateInput): Result<Registry> {
  const editing = input.id !== undefined
  if (editing && !reg.templates.some((t) => t.id === input.id)) return fail('Esse atalho não existe mais.')
  const name = checkName(
    input.name,
    reg.templates.filter((t) => t.id !== input.id).map((t) => t.name),
    MAX_TEMPLATE_NAME,
  )
  if (!name.ok) return name
  if (!reg.categories.includes(input.category)) return fail('Escolha uma categoria da lista.')
  if (!reg.payments.some((p) => p.id === input.paymentMethod)) return fail('Escolha uma forma de pagamento da lista.')
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) return fail('O valor não pode ser negativo.')
  if (input.dueDay !== null && (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31)) {
    return fail('O dia do vencimento deve ser de 1 a 31.')
  }
  const supplier = input.supplier.trim()
  if (supplier.length > MAX_NAME) return fail(`O fornecedor deve ter até ${MAX_NAME} letras.`)
  const parcelas = input.installmentCount ?? null
  if (parcelas !== null && (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_BILL_INSTALLMENTS)) {
    return fail(`O número de parcelas deve ser de 1 a ${MAX_BILL_INSTALLMENTS}.`)
  }

  const saved: Template = {
    id: input.id ?? newTemplateId(new Set(reg.templates.map((t) => t.id))),
    name: name.value,
    category: input.category,
    amountCents: input.amountCents,
    dueDay: input.dueDay,
    recurrence: input.recurrence,
    valueType: input.valueType,
    paymentMethod: input.paymentMethod,
    supplier,
    ...(parcelas !== null ? { installmentCount: parcelas } : {}),
  }
  const templates = editing ? reg.templates.map((t) => (t.id === saved.id ? saved : t)) : [...reg.templates, saved]
  return ok({ ...reg, templates })
}

export function removeTemplate(reg: Registry, id: string): Registry {
  return { ...reg, templates: reg.templates.filter((t) => t.id !== id) }
}

/** Atalhos padrão que a pessoa não tem (ela pode ter apagado ou renomeado), já ajustados às categorias e formas dela. */
export function missingDefaultTemplates(reg: Registry): Template[] {
  const have = new Set(reg.templates.map((t) => simplify(t.name)))
  const taken = new Set(reg.templates.map((t) => t.id))
  return defaultTemplates()
    .filter((t) => !have.has(simplify(t.name)) && !taken.has(t.id))
    .map((t) => ({
      ...t,
      category: reg.categories.includes(t.category) ? t.category : FALLBACK_CATEGORY,
      paymentMethod: reg.payments.some((p) => p.id === t.paymentMethod) ? t.paymentMethod : reg.payments[0].id,
    }))
}

/**
 * Categoria sugerida pelo nome de uma conta nova: vale o nome igual (sem ligar para acento e caixa) de uma conta que a pessoa
 * já tem ou de um atalho. A conta da própria pessoa vence o atalho. Devolve null se nada combina ou se a categoria saiu da lista.
 */
export function suggestCategory(reg: Registry, bills: Pick<Bill, 'name' | 'category'>[], name: string): string | null {
  const key = simplify(name)
  if (key === '') return null
  const found = bills.find((b) => simplify(b.name) === key)?.category ?? reg.templates.find((t) => simplify(t.name) === key)?.category ?? null
  return found !== null && reg.categories.includes(found) ? found : null
}

/** Atalhos que ainda cabem na tela Nova conta: some o que já está cadastrado como conta. */
export function availableTemplates(templates: Template[], bills: Pick<Bill, 'name'>[]): Template[] {
  const used = new Set(bills.map((b) => simplify(b.name)))
  return templates.filter((t) => !used.has(simplify(t.name)))
}

/* ---------- Uso (para avisar antes de excluir) ---------- */

export function countBills(bills: Bill[], by: 'category' | 'paymentMethod' | 'supplier', value: string): number {
  return bills.filter((b) =>
    by === 'supplier' ? simplify(b.supplier) === simplify(value) && simplify(value) !== '' : b[by] === value,
  ).length
}
