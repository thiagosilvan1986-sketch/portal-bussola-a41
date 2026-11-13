import { addMonths, competenceOf, daysInMonth, formatDateBR } from './dates'
import { MAX_BILL_INSTALLMENTS, RECURRENCE_LABEL, installmentsUntil } from './bills'
import { parseCsv, toCsv, unprotectCell } from './csv'
import { defaultRegistry, paymentLabel, type Registry } from './registry'
import { simplify } from './text'
import { centsToInput, parseBRLToCents } from './money'
import {
  MAX_INSTALLMENTS,
  buildInstallments,
  formatPhone,
  isValidEmail,
  isSettled,
  isValidPhone,
  phoneDigits,
  summarizeReceivable,
  withFirstReceived,
} from './receivables'
import type {
  Bill,
  Competence,
  IsoDate,
  PaymentMethod,
  Person,
  Receivable,
  ReceivableKind,
  Recurrence,
  ValueType,
} from './types'

/**
 * Importar e exportar planilhas (CSV): contas a pagar e a receber.
 * A importação confere linha por linha e só grava o que está certo; o que já existe é ignorado,
 * então importar o mesmo arquivo duas vezes não duplica nada.
 */

export const MAX_IMPORT_ROWS = 500
export const MAX_IMPORT_BYTES = 1_000_000

const MAX_TEXT = 120
const MAX_NOTES = 500

/** Conta lida da planilha. `paidInstallments` (parcelas já pagas) não é gravado na conta: vira lançamentos pagos na importação. */
export type NewBill = Omit<Bill, 'id'> & { paidInstallments?: number }
export type NewPersonData = Omit<Person, 'id'>
export type NewReceivable = Omit<Receivable, 'id' | 'personId'>

export interface RowNote {
  /** Linha do arquivo (1 = cabeçalho). */
  line: number
  message: string
}

export interface ImportReport {
  /** Problema que impede de ler o arquivo todo (vazio, sem coluna obrigatória…). */
  fileError: string | null
  /** Linhas de dados lidas. */
  total: number
  /** Linhas com erro: não são importadas. */
  errors: RowNote[]
  /** Linhas importadas com algum ajuste automático. */
  warnings: RowNote[]
  /** Linhas que já existem (ou repetidas no arquivo): ignoradas. */
  duplicates: number
}

export interface BillImportPlan extends ImportReport {
  bills: NewBill[]
}

export interface ReceivableImportItem {
  /** Chave da pessoa (nome sem acento/caixa). */
  personKey: string
  /** Id da pessoa já cadastrada, ou null se é uma pessoa nova do arquivo. */
  personId: string | null
  receivable: NewReceivable
}

export interface ReceivableImportPlan extends ImportReport {
  newPeople: { key: string; person: NewPersonData }[]
  items: ReceivableImportItem[]
}

/* ---------- Texto e valores ---------- */

export { simplify }

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function validYear(y: number): boolean {
  return y >= 2000 && y <= 2100
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "05/09/2026", "5/9/26", "2026-09-05" (com ou sem hora) -> "2026-09-05"; data que não existe -> null. */
export function parseDateInput(raw: string): IsoDate | null {
  const s = raw.trim().split(/[ T]/)[0]
  let y: number
  let m: number
  let d: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (match) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    d = Number(match[1])
    m = Number(match[2])
    y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
  } else {
    return null
  }
  if (!validYear(y) || m < 1 || m > 12 || d < 1 || d > daysInMonth(`${y}-${pad(m)}`)) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** "11/2026", "2026-11", "nov/2026", "nov/26" ou uma data completa -> "2026-11". */
export function parseMonthInput(raw: string): Competence | null {
  const s = raw.trim()
  let match = /^(\d{4})-(\d{1,2})$/.exec(s)
  if (match) return monthOf(Number(match[1]), Number(match[2]))
  if ((match = /^(\d{1,2})\/(\d{4})$/.exec(s))) return monthOf(Number(match[2]), Number(match[1]))
  if ((match = /^([^\d/.\- ]{3,9})[/.\- ](\d{2}|\d{4})$/.exec(s))) {
    const index = MONTH_NAMES.indexOf(simplify(match[1]).slice(0, 3))
    const y = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2])
    return index >= 0 ? monthOf(y, index + 1) : null
  }
  const date = parseDateInput(s)
  return date ? competenceOf(date) : null
}

function monthOf(y: number, m: number): Competence | null {
  return validYear(y) && m >= 1 && m <= 12 ? `${y}-${pad(m)}` : null
}

type Table<T> = [names: string[], value: T][]

function lookup<T>(raw: string, table: Table<T>): T | undefined {
  const key = simplify(raw)
  return table.find(([names]) => names.includes(key))?.[1]
}

const VALUE_TYPES: Table<ValueType> = [
  [['fixo', 'fixa'], 'fixed'],
  [['variavel', 'estimado', 'estimada'], 'variable'],
]

const RECURRENCES: Table<Recurrence> = [
  [['mensal', 'mensalmente'], 'monthly'],
  [['bimestral'], 'bimonthly'],
  [['trimestral'], 'quarterly'],
  [['anual', 'anualmente'], 'yearly'],
]

const PAYMENTS: Table<PaymentMethod> = [
  [['boleto'], 'boleto'],
  [['debitoautomatico', 'debito', 'debitoemconta', 'debitoauto'], 'debito_automatico'],
  [['pix'], 'pix'],
  [['cartao', 'cartaodecredito', 'credito'], 'cartao'],
]

/** Forma de pagamento da planilha: vale o nome ou o código cadastrado, ou um apelido dos padrões (ex.: "débito"). */
function findPayment(raw: string, registry: Registry): PaymentMethod | undefined {
  const key = simplify(raw)
  const own = registry.payments.find((p) => simplify(p.label) === key || simplify(p.id) === key)
  if (own) return own.id
  const alias = lookup(raw, PAYMENTS)
  return alias && registry.payments.some((p) => p.id === alias) ? alias : undefined
}

/** "A, B ou C" */
function orList(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ou ${items[items.length - 1]}`
}

const KINDS: Table<ReceivableKind> = [
  [['cartao', 'reembolso', 'reembolsodocartao', 'compranocartao', 'cartaodecredito'], 'cartao'],
  [['servico', 'servicos', 'servicoprestado', 'servicosprestados'], 'servico'],
]

const YES = ['sim', 's', 'true', '1', 'ativa', 'ativo', 'yes', 'x']
const NO = ['nao', 'n', 'false', '0', 'inativa', 'inativo', 'arquivada', 'arquivado', 'no']

const KIND_CSV: Record<ReceivableKind, string> = { cartao: 'Cartão', servico: 'Serviço', rateio: 'Rateio' }
const VALUE_TYPE_CSV: Record<ValueType, string> = { fixed: 'Fixo', variable: 'Variável' }

/* ---------- Colunas ---------- */

type Columns<F extends string> = Partial<Record<F, number>>

/** Descobre em que posição está cada coluna, pelo nome do cabeçalho (qualquer ordem; colunas desconhecidas são ignoradas). */
function mapColumns<F extends string>(header: string[], spec: Record<F, string[]>): Columns<F> {
  const found: Columns<F> = {}
  header.forEach((title, index) => {
    const key = simplify(unprotectCell(title))
    for (const field of Object.keys(spec) as F[]) {
      if (found[field] === undefined && spec[field].includes(key)) {
        found[field] = index
        return
      }
    }
  })
  return found
}

function missingColumn<F extends string>(columns: Columns<F>, required: [F, string][]): string | null {
  const missing = required.filter(([field]) => columns[field] === undefined).map(([, title]) => `“${title}”`)
  if (missing.length === 0) return null
  return `Não encontrei ${missing.length > 1 ? 'as colunas' : 'a coluna'} ${missing.join(' e ')} na primeira linha do arquivo.`
}

function cellAt(row: string[], index: number | undefined): string {
  return index === undefined ? '' : unprotectCell((row[index] ?? '').trim())
}

function emptyReport(): ImportReport {
  return { fileError: null, total: 0, errors: [], warnings: [], duplicates: 0 }
}

function failed(message: string): ImportReport {
  return { ...emptyReport(), fileError: message }
}

/** Lê o arquivo e separa cabeçalho e linhas, com os limites de tamanho. */
function readTable(text: string): { header: string[]; rows: string[][]; lines: number[] } | string {
  const parsed = parseCsv(text)
  if (parsed.unterminated) return 'O arquivo tem aspas abertas e nunca fechadas. Ele parece incompleto.'
  if (parsed.rows.length === 0) return 'O arquivo está vazio.'
  if (parsed.rows.length === 1) return 'O arquivo tem só o cabeçalho, sem nenhuma linha de dados.'
  if (parsed.rows.length - 1 > MAX_IMPORT_ROWS) {
    return `O arquivo tem mais de ${MAX_IMPORT_ROWS} linhas. Divida em arquivos menores.`
  }
  return { header: parsed.rows[0], rows: parsed.rows.slice(1), lines: parsed.lines.slice(1) }
}

function tooLong(value: string, label: string, max = MAX_TEXT): string | null {
  return value.length > max ? `${label} com mais de ${max} caracteres` : null
}

/* ---------- Contas a pagar ---------- */

export const BILL_HEADERS = [
  'Nome',
  'Categoria',
  'Fornecedor',
  'Tipo de valor',
  'Valor',
  'Dia do vencimento',
  'Periodicidade',
  'Início',
  'Forma de pagamento',
  'Observações',
  'Ativa',
  'Parcelas',
  'Parcelas pagas',
]

type BillField =
  | 'name'
  | 'category'
  | 'supplier'
  | 'valueType'
  | 'amount'
  | 'dueDay'
  | 'recurrence'
  | 'startMonth'
  | 'payment'
  | 'notes'
  | 'active'
  | 'installments'
  | 'paidInstallments'

const BILL_COLUMNS: Record<BillField, string[]> = {
  name: ['nome', 'conta', 'nomedaconta', 'descricao'],
  category: ['categoria'],
  supplier: ['fornecedor', 'empresa', 'beneficiario'],
  valueType: ['tipodevalor', 'tipovalor'],
  amount: ['valor', 'valorprevisto', 'valorestimado', 'valormensal'],
  dueDay: ['diadovencimento', 'diavencimento', 'dia', 'vencimento'],
  recurrence: ['periodicidade', 'recorrencia', 'frequencia'],
  startMonth: ['inicio', 'mesdeinicio', 'comecaem'],
  payment: ['formadepagamento', 'formapagamento', 'pagamento', 'forma'],
  notes: ['observacoes', 'observacao', 'obs', 'notas'],
  active: ['ativa', 'ativo'],
  installments: ['parcelas', 'numerodeparcelas', 'qtdparcelas', 'quantidadedeparcelas', 'nparcelas'],
  paidInstallments: ['parcelaspagas', 'parcelasjapagas', 'pagas', 'japagas'],
}

const monthText = (c: Competence) => `${c.slice(5)}/${c.slice(0, 4)}`

export function billsToCsv(bills: Bill[], registry: Registry = defaultRegistry()): string {
  const sorted = [...bills].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return toCsv([
    BILL_HEADERS,
    ...sorted.map((b) => [
      b.name,
      b.category,
      b.supplier,
      VALUE_TYPE_CSV[b.valueType],
      centsToInput(b.expectedAmountCents),
      String(b.dueDay),
      RECURRENCE_LABEL[b.recurrence],
      monthText(b.startMonth),
      paymentLabel(registry, b.paymentMethod),
      b.notes,
      b.active ? 'Sim' : 'Não',
      b.installmentCount ? String(b.installmentCount) : '',
      '',
    ]),
  ])
}

/** Modelo para preencher: cabeçalho e dois exemplos (a prévia da importação mostra tudo antes de gravar). */
export function billsTemplateCsv(): string {
  return toCsv([
    BILL_HEADERS,
    ['Energia elétrica', 'Contas de consumo', 'Companhia de energia', 'Variável', '180,00', '10', 'Mensal', '01/2026', 'Boleto', '', 'Sim', '', ''],
    ['Plano de saúde', 'Saúde', 'Operadora', 'Fixo', '650,90', '5', 'Mensal', '01/2026', 'Débito automático', 'Titular e dependente', 'Sim', '', ''],
    ['Parcela do carro', 'Transporte', 'Banco', 'Fixo', '980,00', '20', 'Mensal', '01/2026', 'Boleto', '48 parcelas, 10 já pagas', 'Sim', '48', '10'],
  ])
}

export function parseBillsCsv(
  text: string,
  existing: Bill[],
  today: IsoDate,
  registry: Registry = defaultRegistry(),
): BillImportPlan {
  const base = (report: ImportReport): BillImportPlan => ({ ...report, bills: [] })
  const table = readTable(text)
  if (typeof table === 'string') return base(failed(table))

  const columns = mapColumns(table.header, BILL_COLUMNS)
  const missing = missingColumn(columns, [
    ['name', 'Nome'],
    ['dueDay', 'Dia do vencimento'],
  ])
  if (missing) return base(failed(missing))

  const plan: BillImportPlan = { ...emptyReport(), total: table.rows.length, bills: [] }
  const seen = new Set(existing.map((b) => `${simplify(b.name)}|${b.dueDay}`))

  table.rows.forEach((row, i) => {
    const line = table.lines[i]
    const errs: string[] = []
    const warns: string[] = []
    const get = (field: BillField) => cellAt(row, columns[field])

    const name = get('name')
    if (!name) errs.push('nome vazio')
    else if (simplify(name) === '') errs.push('nome inválido')
    else {
      const long = tooLong(name, 'nome')
      if (long) errs.push(long)
    }

    let category = 'Outros'
    const categoryRaw = get('category')
    if (categoryRaw) {
      const found = registry.categories.find((c) => simplify(c) === simplify(categoryRaw))
      if (found) category = found
      else warns.push(`categoria “${categoryRaw}” não existe; usei “Outros”`)
    }

    const supplier = get('supplier')
    const longSupplier = tooLong(supplier, 'fornecedor')
    if (longSupplier) errs.push(longSupplier)

    let cents = 0
    let amountOk = true
    const amountRaw = get('amount')
    if (amountRaw) {
      const parsed = parseBRLToCents(amountRaw)
      if (parsed === null) {
        errs.push(`valor inválido “${amountRaw}”`)
        amountOk = false
      } else {
        cents = parsed
      }
    }

    let valueType: ValueType = cents > 0 ? 'fixed' : 'variable'
    const valueTypeRaw = get('valueType')
    if (valueTypeRaw) {
      const found = lookup(valueTypeRaw, VALUE_TYPES)
      if (found) valueType = found
      else errs.push(`tipo de valor “${valueTypeRaw}” não reconhecido (use Fixo ou Variável)`)
    }
    if (valueType === 'fixed' && cents === 0 && amountOk) errs.push('conta de valor fixo precisa de valor maior que zero')

    let dueDay = 0
    const dayRaw = get('dueDay')
    if (!dayRaw) {
      errs.push('dia do vencimento vazio')
    } else {
      const date = parseDateInput(dayRaw)
      const day = /^\d{1,2}$/.test(dayRaw) ? Number(dayRaw) : date ? Number(date.slice(8)) : NaN
      if (day >= 1 && day <= 31) dueDay = day
      else errs.push(`dia do vencimento “${dayRaw}” deve ser de 1 a 31`)
    }

    let recurrence: Recurrence = 'monthly'
    const recurrenceRaw = get('recurrence')
    if (recurrenceRaw) {
      const found = lookup(recurrenceRaw, RECURRENCES)
      if (found) recurrence = found
      else errs.push(`periodicidade “${recurrenceRaw}” não reconhecida (Mensal, Bimestral, Trimestral ou Anual)`)
    }

    let startMonth = competenceOf(today)
    const startRaw = get('startMonth')
    if (startRaw) {
      const found = parseMonthInput(startRaw)
      if (found) startMonth = found
      else errs.push(`início “${startRaw}” inválido (use mês/ano, como 11/2026)`)
    }

    let paymentMethod: PaymentMethod = registry.payments.some((p) => p.id === 'boleto') ? 'boleto' : registry.payments[0].id
    const paymentRaw = get('payment')
    if (paymentRaw) {
      const found = findPayment(paymentRaw, registry)
      if (found) paymentMethod = found
      else errs.push(`forma de pagamento “${paymentRaw}” não reconhecida (${orList(registry.payments.map((p) => p.label))})`)
    }

    let active = true
    const activeRaw = get('active')
    if (activeRaw) {
      const key = simplify(activeRaw)
      if (YES.includes(key)) active = true
      else if (NO.includes(key)) active = false
      else errs.push(`“Ativa” deve ser Sim ou Não, e veio “${activeRaw}”`)
    }

    const notes = get('notes')
    const longNotes = tooLong(notes, 'observações', MAX_NOTES)
    if (longNotes) errs.push(longNotes)

    let installmentCount = 0
    const installmentsRaw = get('installments')
    if (installmentsRaw) {
      const n = /^\d{1,3}$/.test(installmentsRaw) ? Number(installmentsRaw) : NaN
      if (n >= 1 && n <= MAX_BILL_INSTALLMENTS) installmentCount = n
      else errs.push(`parcelas “${installmentsRaw}” deve ser um número de 1 a ${MAX_BILL_INSTALLMENTS}`)
    }

    let paidInstallments = 0
    const paidRaw = get('paidInstallments')
    if (paidRaw) {
      const n = /^\d{1,3}$/.test(paidRaw) ? Number(paidRaw) : NaN
      const elapsed = installmentCount > 0 ? Math.min(installmentCount, installmentsUntil(startMonth, competenceOf(today), recurrence) ?? 0) : 0
      if (Number.isNaN(n)) errs.push(`parcelas pagas “${paidRaw}” deve ser um número`)
      else if (n > 0 && installmentCount === 0) errs.push('informe o número de parcelas para usar “Parcelas pagas”')
      else if (n > Math.max(installmentCount - 1, 0) || n > elapsed) {
        errs.push(`parcelas pagas (${n}) não pode passar de ${Math.max(Math.min(installmentCount - 1, elapsed), 0)}, que são as parcelas que já venceram`)
      } else paidInstallments = n
    }
    if (installmentCount > 0 && errs.length === 0) {
      const overdue = Math.min(installmentCount, installmentsUntil(startMonth, addMonths(competenceOf(today), -1), recurrence) ?? 0) - paidInstallments
      if (overdue > 0) warns.push(`${overdue} ${overdue === 1 ? 'parcela já venceu sem pagamento e entra' : 'parcelas já venceram sem pagamento e entram'} como atrasada${overdue === 1 ? '' : 's'}`)
    }

    if (errs.length > 0) {
      plan.errors.push({ line, message: errs.join('; ') })
      return
    }

    const key = `${simplify(name)}|${dueDay}`
    if (seen.has(key)) {
      plan.duplicates += 1
      return
    }
    seen.add(key)

    if (warns.length > 0) plan.warnings.push({ line, message: warns.join('; ') })
    plan.bills.push({
      name,
      category,
      supplier,
      valueType,
      expectedAmountCents: cents,
      dueDay,
      recurrence,
      startMonth,
      paymentMethod,
      notes,
      active,
      skippedMonths: [],
      ...(installmentCount > 0 ? { installmentCount } : {}),
      ...(paidInstallments > 0 ? { paidInstallments } : {}),
    })
  })

  return plan
}

/* ---------- A receber ---------- */

/** Colunas que a importação lê. */
export const RECEIVABLE_HEADERS = [
  'Pessoa',
  'Telefone',
  'E-mail',
  'Tipo',
  'Descrição',
  'Valor total',
  'Parcelas',
  'Primeiro vencimento',
  'Parcelas recebidas',
  'Observações',
]

/** Colunas só de consulta, que entram na exportação e são ignoradas na importação. */
const RECEIVABLE_INFO_HEADERS = ['Recebido', 'A receber', 'Situação']

type ReceivableField =
  | 'person'
  | 'phone'
  | 'email'
  | 'kind'
  | 'description'
  | 'total'
  | 'count'
  | 'firstDue'
  | 'paidCount'
  | 'notes'

const RECEIVABLE_COLUMNS: Record<ReceivableField, string[]> = {
  person: ['pessoa', 'nome', 'cliente', 'devedor'],
  phone: ['telefone', 'celular', 'whatsapp', 'fone'],
  email: ['email'],
  kind: ['tipo', 'tipodecompra'],
  description: ['descricao', 'compra', 'item', 'servico'],
  total: ['valortotal', 'total', 'valor'],
  count: ['parcelas', 'numerodeparcelas', 'quantidadedeparcelas', 'qtdeparcelas'],
  firstDue: ['primeirovencimento', '1vencimento', 'primeiraparcela', 'vencimento'],
  paidCount: ['parcelasrecebidas', 'recebidas', 'jarecebidas'],
  notes: ['observacoes', 'observacao', 'obs', 'notas'],
}

/** Quantas parcelas, em sequência desde a primeira, já foram quitadas. Quitada fora de ordem não entra, para não afirmar o que não houve. */
function leadingSettled(r: Receivable): number {
  let n = 0
  for (const i of [...r.installments].sort((a, b) => a.number - b.number)) {
    if (isSettled(i)) n += 1
    else break
  }
  return n
}

export function receivablesToCsv(receivables: Receivable[], people: Person[], today: IsoDate): string {
  const byId = new Map(people.map((p) => [p.id, p]))
  const sorted = [...receivables].sort(
    (a, b) =>
      (byId.get(a.personId)?.name ?? '').localeCompare(byId.get(b.personId)?.name ?? '', 'pt-BR') ||
      a.firstDueDate.localeCompare(b.firstDueDate),
  )
  return toCsv([
    [...RECEIVABLE_HEADERS, ...RECEIVABLE_INFO_HEADERS],
    ...sorted.map((r) => {
      const person = byId.get(r.personId)
      const s = summarizeReceivable(r, today)
      const situation = s.remainingCents === 0 ? 'Quitada' : s.overdueCount > 0 ? 'Atrasada' : 'Em aberto'
      return [
        person?.name ?? '',
        person ? formatPhone(person.phone) : '',
        person?.email ?? '',
        KIND_CSV[r.kind],
        r.description,
        centsToInput(r.totalCents),
        String(r.installmentCount),
        formatDateBR(r.firstDueDate),
        String(leadingSettled(r)),
        r.notes,
        centsToInput(s.receivedCents),
        centsToInput(s.remainingCents),
        situation,
      ]
    }),
  ])
}

export function receivablesTemplateCsv(): string {
  return toCsv([
    RECEIVABLE_HEADERS,
    ['Ana Souza', '(11) 98765-4321', 'ana@exemplo.com', 'Cartão', 'Tênis', '420,00', '10', '05/12/2026', '0', ''],
    ['Bruno Lima', '', '', 'Serviço', 'Instalação de ar-condicionado', '900,00', '3', '15/12/2026', '0', 'Combinado por mensagem'],
  ])
}

export function parseReceivablesCsv(
  text: string,
  people: Person[],
  existing: Receivable[],
  today: IsoDate,
): ReceivableImportPlan {
  const base = (report: ImportReport): ReceivableImportPlan => ({ ...report, newPeople: [], items: [] })
  const table = readTable(text)
  if (typeof table === 'string') return base(failed(table))

  const columns = mapColumns(table.header, RECEIVABLE_COLUMNS)
  const missing = missingColumn(columns, [
    ['person', 'Pessoa'],
    ['description', 'Descrição'],
    ['total', 'Valor total'],
    ['firstDue', 'Primeiro vencimento'],
  ])
  if (missing) return base(failed(missing))

  const plan: ReceivableImportPlan = { ...emptyReport(), total: table.rows.length, newPeople: [], items: [] }

  const knownPeople = new Map<string, Person>()
  for (const p of people) if (!knownPeople.has(simplify(p.name))) knownPeople.set(simplify(p.name), p)
  const nameById = new Map(people.map((p) => [p.id, simplify(p.name)]))
  const newPeople = new Map<string, { key: string; person: NewPersonData }>()
  const seen = new Set(
    existing.map(
      (r) =>
        `${nameById.get(r.personId) ?? r.personId}|${r.kind}|${simplify(r.description)}|${r.totalCents}|${r.firstDueDate}`,
    ),
  )

  table.rows.forEach((row, i) => {
    const line = table.lines[i]
    const errs: string[] = []
    const warns: string[] = []
    const get = (field: ReceivableField) => cellAt(row, columns[field])

    const personName = get('person')
    const personKey = simplify(personName)
    if (!personName) errs.push('pessoa vazia')
    else if (!personKey) errs.push('nome da pessoa inválido')
    else {
      const long = tooLong(personName, 'nome da pessoa')
      if (long) errs.push(long)
    }

    let phone = ''
    const phoneRaw = get('phone')
    if (phoneRaw) {
      if (isValidPhone(phoneRaw)) phone = phoneDigits(phoneRaw)
      else warns.push(`telefone “${phoneRaw}” inválido; deixei em branco`)
    }
    let email = ''
    const emailRaw = get('email')
    if (emailRaw) {
      if (isValidEmail(emailRaw)) email = emailRaw
      else warns.push(`e-mail “${emailRaw}” inválido; deixei em branco`)
    }

    let kind: ReceivableKind = 'cartao'
    const kindRaw = get('kind')
    if (kindRaw) {
      const found = lookup(kindRaw, KINDS)
      if (found) kind = found
      else errs.push(`tipo “${kindRaw}” não reconhecido (Cartão ou Serviço)`)
    }

    const description = get('description')
    if (!description) errs.push('descrição vazia')
    else {
      const long = tooLong(description, 'descrição')
      if (long) errs.push(long)
    }

    let totalCents = 0
    const totalRaw = get('total')
    if (!totalRaw) {
      errs.push('valor total vazio')
    } else {
      const parsed = parseBRLToCents(totalRaw)
      if (parsed === null) errs.push(`valor total inválido “${totalRaw}”`)
      else if (parsed === 0) errs.push('valor total precisa ser maior que zero')
      else totalCents = parsed
    }

    let count = 1
    const countRaw = get('count')
    if (countRaw) {
      const n = /^\d{1,3}$/.test(countRaw) ? Number(countRaw) : NaN
      if (n >= 1 && n <= MAX_INSTALLMENTS) count = n
      else errs.push(`parcelas “${countRaw}” deve ser um número de 1 a ${MAX_INSTALLMENTS}`)
    }

    let firstDueDate: IsoDate = today
    const dueRaw = get('firstDue')
    if (!dueRaw) {
      errs.push('primeiro vencimento vazio')
    } else {
      const parsed = parseDateInput(dueRaw)
      if (parsed) firstDueDate = parsed
      else errs.push(`primeiro vencimento “${dueRaw}” inválido (use dia/mês/ano, como 05/12/2026)`)
    }

    let paidCount = 0
    const paidRaw = get('paidCount')
    if (paidRaw) {
      const n = /^\d{1,3}$/.test(paidRaw) ? Number(paidRaw) : NaN
      if (Number.isNaN(n)) errs.push(`parcelas recebidas “${paidRaw}” deve ser um número`)
      else if (n > count) errs.push(`parcelas recebidas (${n}) maior que o número de parcelas (${count})`)
      else paidCount = n
    }

    const notes = get('notes')
    const longNotes = tooLong(notes, 'observações', MAX_NOTES)
    if (longNotes) errs.push(longNotes)

    if (errs.length > 0) {
      plan.errors.push({ line, message: errs.join('; ') })
      return
    }

    const key = `${personKey}|${kind}|${simplify(description)}|${totalCents}|${firstDueDate}`
    if (seen.has(key)) {
      plan.duplicates += 1
      return
    }
    seen.add(key)

    const known = knownPeople.get(personKey)
    if (!known) {
      const pending = newPeople.get(personKey)
      if (!pending) {
        newPeople.set(personKey, {
          key: personKey,
          person: { name: personName, phone, email, charges: [], tone: 'amigavel' },
        })
      } else {
        // Mesma pessoa em várias linhas: o primeiro contato informado vale.
        if (!pending.person.phone && phone) pending.person.phone = phone
        if (!pending.person.email && email) pending.person.email = email
      }
    }

    if (warns.length > 0) plan.warnings.push({ line, message: warns.join('; ') })
    plan.items.push({
      personKey,
      personId: known?.id ?? null,
      receivable: {
        kind,
        description,
        totalCents,
        installmentCount: count,
        firstDueDate,
        installments: withFirstReceived(buildInstallments(totalCents, count, firstDueDate), paidCount, today),
        notes,
      },
    })
  })

  plan.newPeople = [...newPeople.values()]
  return plan
}
