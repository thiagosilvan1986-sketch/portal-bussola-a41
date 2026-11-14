import { addMonths, competenceOf, diffDays, dueDateFor, formatCompetenceShort, formatDateBR } from './dates'
import { DUE_SOON_DAYS } from './entries'
import { formatBRL } from './money'
import { simplify } from './text'
import type {
  Bill,
  ChargeChannel,
  ChargeLog,
  Competence,
  DisplayStatus,
  Installment,
  IsoDate,
  MessageTone,
  Person,
  Receivable,
  ReceivableKind,
  ValueType,
} from './types'

export const MAX_INSTALLMENTS = 60

export const RECEIVABLE_KINDS: ReceivableKind[] = ['cartao', 'servico', 'rateio']

export const KIND_INFO: Record<ReceivableKind, { tab: string; title: string; hint: string; placeholder: string }> = {
  cartao: {
    tab: 'Cartão',
    title: 'Reembolso do cartão',
    hint: 'Compra passada no seu cartão para outra pessoa. É só o reembolso: cobre a fatura e não é receita.',
    placeholder: 'Ex.: Tênis no cartão',
  },
  servico: {
    tab: 'Serviços',
    title: 'Serviço prestado',
    hint: 'Serviço que você presta e recebe por mês, com valor fixo ou variável, sem fim ou com número de parcelas.',
    placeholder: 'Ex.: Instalação de ar-condicionado',
  },
  rateio: {
    tab: 'Rateios',
    title: 'Rateio de conta',
    hint: 'A parte de outra pessoa numa conta que você paga (aluguel, energia). Fica ligada à conta e repete todo mês, com ou sem fim.',
    placeholder: 'Ex.: Parte da Carol no aluguel',
  },
}

const KIND_NOUN: Record<ReceivableKind, string> = { cartao: 'reembolso do cartão', servico: 'serviço prestado', rateio: 'rateio de conta' }

/**
 * Título da tela de cadastro, que acompanha as opções escolhidas:
 * "Novo reembolso do cartão", "Novo serviço prestado em 10x" (só com mais de 1 parcela), "Editar serviço prestado".
 */
export function receivableFormTitle(kind: ReceivableKind, opts: { editing: boolean; installments: number | null }): string {
  if (opts.editing) return `Editar ${KIND_NOUN[kind]}`
  const times = opts.installments !== null && opts.installments > 1 ? ` em ${opts.installments}x` : ''
  return `Novo ${KIND_NOUN[kind]}${times}`
}

/** Endereço da lista de cada tipo (a de cartão é a padrão). */
export function listPath(kind: ReceivableKind): string {
  if (kind === 'servico') return '/receber?aba=servicos'
  if (kind === 'rateio') return '/receber?aba=rateios'
  return '/receber'
}

/** Tipo pela aba da lista ("?aba=servicos", "?aba=rateios"); sem aba, cartão. */
export function kindOfTab(aba: string | null): ReceivableKind {
  if (aba === 'servicos') return 'servico'
  if (aba === 'rateios') return 'rateio'
  return 'cartao'
}

/**
 * Conta paga com cartão de crédito: a forma "Cartão" do app ou qualquer forma cadastrada cujo nome fale em crédito
 * ou cartão (débito fica de fora). É o que pode ser ligado a um reembolso do cartão.
 */
export function isCardBill(bill: Pick<Bill, 'paymentMethod'>, payments: readonly { id: string; label: string }[]): boolean {
  if (bill.paymentMethod === 'cartao') return true
  const label = payments.find((p) => p.id === bill.paymentMethod)?.label ?? bill.paymentMethod
  const key = simplify(label)
  return !key.includes('debito') && (key.includes('credito') || key.includes('cartao'))
}

/* ---------- Rateio de conta ---------- */

/** Rateio ou serviço mensal sem número de parcelas: repete todo mês até ser encerrado. */
export function isOpenEnded(r: Pick<Receivable, 'kind' | 'recurring'>): boolean {
  return (r.kind === 'rateio' || r.kind === 'servico') && r.recurring === true
}

/** Cobrança por mês (valor mensal): todo rateio e os serviços cadastrados a partir da v1.21. Os serviços antigos são valor total parcelado. */
export function isMonthly(r: Pick<Receivable, 'kind' | 'monthlyCents'>): boolean {
  return r.kind === 'rateio' || (r.kind === 'servico' && r.monthlyCents !== undefined)
}

/** Serviço de valor variável com o valor do mês ainda por informar. */
export function amountPending(r: Pick<Receivable, 'valueType'>, i: Installment): boolean {
  return r.valueType === 'variable' && i.amountSet !== true && i.paidAt === null
}

/** Como se chama cada mês: "parte" no rateio, "mensalidade" no serviço mensal. */
const monthWord = (r: Pick<Receivable, 'kind'>) => (r.kind === 'rateio' ? 'parte' : 'mensalidade')
const capital = (w: string) => w[0].toUpperCase() + w.slice(1)

/**
 * Parcelas do rateio: `monthlyCents` a cada mês, a partir de `startMonth`, no dia de vencimento da conta ligada.
 * Com `count`, são `count` meses; sem ele (sem fim), vai até `until` (ou até `endMonth`, se vier antes).
 */
export function buildRateio(
  monthlyCents: number,
  startMonth: Competence,
  dueDay: number,
  opts: { count: number } | { until: Competence; endMonth?: Competence | null },
): Installment[] {
  let months: number
  if ('count' in opts) months = opts.count
  else {
    const last = opts.endMonth && opts.endMonth < opts.until ? opts.endMonth : opts.until
    months = last < startMonth ? 1 : monthsBetween(startMonth, last) + 1
  }
  return Array.from({ length: months }, (_, k) => ({
    number: k + 1,
    dueDate: dueDateFor(addMonths(startMonth, k), dueDay),
    amountCents: monthlyCents,
    paidAt: null,
    paidAmountCents: null,
  }))
}

function monthsBetween(a: Competence, b: Competence): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/**
 * Completa o rateio sem fim até o mês `until` (ou até o mês de encerramento): as parcelas gravadas ficam como estão
 * (com as baixas), e os meses que faltam entram com o valor mensal. Depois do encerramento, só ficam os meses já recebidos.
 * Os outros tipos voltam sem mudança.
 */
export function extendRecurring(r: Receivable, until: Competence): Receivable {
  if (!isOpenEnded(r)) return r
  const start = competenceOf(r.firstDueDate)
  const day = Number(r.firstDueDate.slice(8, 10))
  const monthly = r.monthlyCents ?? r.installments[0]?.amountCents ?? 0
  const fresh = buildRateio(monthly, start, day, { until, endMonth: r.endMonth ?? null })
  const byNumber = new Map(r.installments.map((i) => [i.number, i]))
  const installments = fresh.map((i) => byNumber.get(i.number) ?? i)
  // Já gravadas além do horizonte (ex.: horizonte menor que o do relatório) continuam; depois do encerramento, só as com baixa.
  for (const old of r.installments) {
    if (old.number <= fresh.length) continue
    const after = r.endMonth ? competenceOf(old.dueDate) > r.endMonth : false
    if (!after || old.paidAt !== null) installments.push(old)
  }
  installments.sort((a, b) => a.number - b.number)
  return {
    ...r,
    installments,
    installmentCount: installments.length,
    totalCents: installments.reduce((acc, i) => acc + i.amountCents, 0),
  }
}

/** Rótulo de uma parcela: "Parcela 3 de 10" ou, sem fim, "Parte de nov/2026" (rateio) e "Mensalidade de nov/2026" (serviço). */
export function parcelLabel(r: Receivable, i: Installment): string {
  return isOpenEnded(r) ? `${capital(monthWord(r))} de ${formatCompetenceShort(competenceOf(i.dueDate))}` : `Parcela ${i.number} de ${r.installmentCount}`
}

/** "3/10" no parcelado; "nov/2026" no rateio sem fim; vazio em compra de uma parcela só. */
export function parcelShort(r: Receivable, i: Installment): string {
  if (isOpenEnded(r)) return formatCompetenceShort(competenceOf(i.dueDate))
  return r.installmentCount > 1 ? `${i.number}/${r.installmentCount}` : ''
}

/** Para as mensagens: "parcela 3 de 10", "parcelas 2 e 3 de 10", "parte de nov/2026", "partes de out/2026 e nov/2026". */
function pieces(r: Receivable, installments: Installment[]): string {
  if (isOpenEnded(r)) {
    const months = installments.map((i) => formatCompetenceShort(competenceOf(i.dueDate)))
    return `${months.length === 1 ? monthWord(r) : `${monthWord(r)}s`} de ${joinWords(months)}`
  }
  const nums = installments.map((i) => i.number)
  return `${nums.length === 1 ? 'parcela' : 'parcelas'} ${joinNumbers(nums)} de ${r.installmentCount}`
}

function joinWords(items: string[]): string {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

export function ofKind(receivables: Receivable[], kind: ReceivableKind): Receivable[] {
  return receivables.filter((r) => r.kind === kind)
}

/**
 * Divide o total em parcelas. A sobra de centavos vai de 1 em 1 para as primeiras parcelas,
 * então a soma é sempre igual ao total. Vencimentos mensais no mesmo dia (dia 31 vira o último dia do mês).
 */
export function buildInstallments(totalCents: number, count: number, firstDueDate: IsoDate): Installment[] {
  const base = Math.floor(totalCents / count)
  const extra = totalCents - base * count
  const day = Number(firstDueDate.slice(8, 10))
  const firstMonth = competenceOf(firstDueDate)
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    dueDate: i === 0 ? firstDueDate : dueDateFor(addMonths(firstMonth, i), day),
    amountCents: base + (i < extra ? 1 : 0),
    paidAt: null,
    paidAmountCents: null,
  }))
}

/** Marca as primeiras `k` parcelas como já recebidas (para cadastrar compra que já está em andamento). */
export function withFirstReceived(installments: Installment[], k: number, today: IsoDate): Installment[] {
  return installments.map((i) =>
    i.number <= k
      ? { ...i, paidAt: i.dueDate < today ? i.dueDate : today, paidAmountCents: i.amountCents }
      : i,
  )
}

/** Maior número de parcela que já teve baixa (0 se nenhuma). */
export function lastPaidNumber(installments: Installment[]): number {
  return installments.reduce((max, i) => (i.paidAt !== null && i.number > max ? i.number : max), 0)
}

export interface ReceivableEdit {
  kind: ReceivableKind
  description: string
  totalCents: number
  installmentCount: number
  firstDueDate: IsoDate
  notes: string
  billId?: string | null
  /** Rateio e serviço mensal: valor por mês, sem fim e mês de encerramento. */
  monthlyCents?: number
  recurring?: boolean
  endMonth?: Competence | null
  /** Serviço mensal: fixo ou variável. */
  valueType?: ValueType
}

/**
 * Ao refazer as parcelas de uma cobrança mensal, mantém de cada mês o que já foi registrado: a baixa (com o valor
 * da época) e, no serviço variável, o valor informado.
 */
function keepRecorded(fresh: Installment[], old: Installment[]): Installment[] {
  return fresh.map((f) => {
    const o = old.find((i) => i.number === f.number)
    if (!o) return f
    // Mês já recebido fica com o valor da época: mudar o valor mensal vale daqui para a frente.
    if (o.paidAt !== null) return { ...f, amountCents: o.amountCents, ...(o.amountSet ? { amountSet: true } : {}), paidAt: o.paidAt, paidAmountCents: o.paidAmountCents }
    return o.amountSet ? { ...f, amountCents: o.amountCents, amountSet: true } : f
  })
}

/**
 * Aplica a edição de uma compra. Se valor, número de parcelas e primeiro vencimento não mudaram, as parcelas
 * ficam como estão. Se mudaram, as parcelas são refeitas e as baixas já registradas são mantidas pelo número
 * da parcela (quem chama garante que o novo número de parcelas não é menor que a última parcela com baixa).
 */
export function editReceivable(r: Receivable, edit: ReceivableEdit): Receivable {
  const monthlyKind = edit.kind === 'rateio' || edit.kind === 'servico'
  if (monthlyKind && edit.recurring) {
    // Sem fim: grava só os meses já gerados; os seguintes o app completa ao ler.
    const day = Number(edit.firstDueDate.slice(8, 10))
    const monthly = edit.monthlyCents ?? 0
    const until = r.installments.length ? competenceOf(r.installments[r.installments.length - 1].dueDate) : competenceOf(edit.firstDueDate)
    const base = { ...r, ...edit, monthlyCents: monthly, endMonth: edit.endMonth ?? null, recurring: true }
    const fresh = buildRateio(monthly, competenceOf(edit.firstDueDate), day, { until, endMonth: edit.endMonth ?? null })
    const kept = keepRecorded(fresh, r.installments)
    return { ...base, installments: kept, installmentCount: kept.length, totalCents: kept.reduce((a, i) => a + i.amountCents, 0) }
  }
  if (monthlyKind && edit.monthlyCents !== undefined) {
    // Rateio ou serviço mensal com parcelas: o valor é por mês, e o total é a soma dos meses.
    const day = Number(edit.firstDueDate.slice(8, 10))
    const fresh = buildRateio(edit.monthlyCents, competenceOf(edit.firstDueDate), day, { count: edit.installmentCount })
    const kept = keepRecorded(fresh, r.installments)
    return { ...r, ...edit, recurring: false, endMonth: null, installments: kept, totalCents: kept.reduce((a, i) => a + i.amountCents, 0) }
  }
  const sameSchedule =
    edit.totalCents === r.totalCents &&
    edit.installmentCount === r.installmentCount &&
    edit.firstDueDate === r.firstDueDate
  const installments = sameSchedule
    ? r.installments
    : buildInstallments(edit.totalCents, edit.installmentCount, edit.firstDueDate).map((fresh) => {
        const old = r.installments.find((i) => i.number === fresh.number)
        return old && old.paidAt !== null
          ? { ...fresh, paidAt: old.paidAt, paidAmountCents: old.paidAmountCents }
          : fresh
      })
  return { ...r, ...edit, installments }
}

export function installmentRemaining(i: Installment): number {
  if (i.paidAt === null) return i.amountCents
  return Math.max(i.amountCents - (i.paidAmountCents ?? 0), 0)
}

export function isSettled(i: Installment): boolean {
  return i.paidAt !== null && installmentRemaining(i) === 0
}

export function installmentStatus(i: Installment, today: IsoDate): DisplayStatus {
  if (isSettled(i)) return 'paga'
  if (i.paidAt !== null) return 'parcial'
  return dueStatus(i, today)
}

function dueStatus(i: Installment, today: IsoDate): DisplayStatus {
  const days = diffDays(today, i.dueDate)
  if (days < 0) return 'atrasada'
  if (days <= DUE_SOON_DAYS) return 'vence_em_breve'
  return 'prevista'
}

/** Registra (ou desfaz, com `null`) o recebimento de uma parcela. */
export function withPayment(
  installments: Installment[],
  number: number,
  payment: { paidAt: IsoDate; paidAmountCents: number } | null,
): Installment[] {
  return installments.map((i) =>
    i.number === number
      ? { ...i, paidAt: payment?.paidAt ?? null, paidAmountCents: payment?.paidAmountCents ?? null }
      : i,
  )
}

export interface ReceivableSummary {
  count: number
  settledCount: number
  receivedCents: number
  remainingCents: number
  overdueCount: number
  overdueCents: number
  nextDueDate: IsoDate | null
}

export function summarizeReceivable(r: Receivable, today: IsoDate): ReceivableSummary {
  const s: ReceivableSummary = {
    count: r.installments.length,
    settledCount: 0,
    receivedCents: 0,
    remainingCents: 0,
    overdueCount: 0,
    overdueCents: 0,
    nextDueDate: null,
  }
  for (const i of r.installments) {
    s.receivedCents += i.paidAt !== null ? (i.paidAmountCents ?? 0) : 0
    if (isSettled(i)) {
      s.settledCount += 1
      continue
    }
    const rest = installmentRemaining(i)
    s.remainingCents += rest
    if (i.dueDate < today) {
      s.overdueCount += 1
      s.overdueCents += rest
    }
    if (s.nextDueDate === null || i.dueDate < s.nextDueDate) s.nextDueDate = i.dueDate
  }
  return s
}

export interface PersonSummary {
  remainingCents: number
  receivedCents: number
  overdueCount: number
  overdueCents: number
  nextDueDate: IsoDate | null
  purchaseCount: number
}

export function summarizePerson(receivables: Receivable[], today: IsoDate): PersonSummary {
  const out: PersonSummary = {
    remainingCents: 0,
    receivedCents: 0,
    overdueCount: 0,
    overdueCents: 0,
    nextDueDate: null,
    purchaseCount: receivables.length,
  }
  for (const r of receivables) {
    const s = summarizeReceivable(r, today)
    out.remainingCents += s.remainingCents
    out.receivedCents += s.receivedCents
    out.overdueCount += s.overdueCount
    out.overdueCents += s.overdueCents
    if (s.nextDueDate !== null && (out.nextDueDate === null || s.nextDueDate < out.nextDueDate)) {
      out.nextDueDate = s.nextDueDate
    }
  }
  return out
}

/* ---------- Previsão por mês ---------- */

export interface ForecastMonth {
  competence: Competence
  /** Soma das parcelas que vencem no mês, recebidas ou não. */
  totalCents: number
  receivedCents: number
  remainingCents: number
}

export interface Forecast {
  /** O que ficou para trás: parcelas de meses anteriores ao atual ainda não quitadas. */
  earlierCents: number
  months: ForecastMonth[]
  /** O que vence depois dos meses mostrados. */
  laterCents: number
  laterFrom: Competence
}

/** Quanto vence (e quanto falta) em cada um dos próximos meses, pelo mês de vencimento da parcela. */
export function forecastByMonth(receivables: Receivable[], today: IsoDate, monthsAhead = 6): Forecast {
  const first = competenceOf(today)
  const months: ForecastMonth[] = Array.from({ length: monthsAhead }, (_, k) => ({
    competence: addMonths(first, k),
    totalCents: 0,
    receivedCents: 0,
    remainingCents: 0,
  }))
  const out: Forecast = { earlierCents: 0, months, laterCents: 0, laterFrom: addMonths(first, monthsAhead) }
  for (const r of receivables) {
    for (const i of r.installments) {
      const c = competenceOf(i.dueDate)
      const rest = installmentRemaining(i)
      if (c < first) {
        out.earlierCents += rest
      } else if (c >= out.laterFrom) {
        out.laterCents += rest
      } else {
        const m = months[months.findIndex((x) => x.competence === c)]
        m.totalCents += i.amountCents
        m.receivedCents += i.paidAt !== null ? (i.paidAmountCents ?? 0) : 0
        m.remainingCents += rest
      }
    }
  }
  return out
}

/* ---------- Histórico de cobranças ---------- */

export const MAX_CHARGE_LOG = 30

const CHANNEL_VIA: Record<ChargeChannel, string> = {
  whatsapp: 'por WhatsApp',
  email: 'por e-mail',
  copia: 'com a mensagem copiada',
}

export const CHANNEL_LABEL: Record<ChargeChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  copia: 'Mensagem copiada',
}

export function channelVia(channel: ChargeChannel): string {
  return CHANNEL_VIA[channel]
}

/** Junta a nova cobrança ao histórico, guardando só as últimas. */
export function addCharge(charges: ChargeLog[] | undefined, log: ChargeLog): ChargeLog[] {
  return [...(charges ?? []), log].slice(-MAX_CHARGE_LOG)
}

/** Tira uma cobrança do histórico (posição na lista original). */
export function removeCharge(charges: ChargeLog[] | undefined, index: number): ChargeLog[] {
  return (charges ?? []).filter((_, i) => i !== index)
}

export function lastCharge(charges: ChargeLog[] | undefined): ChargeLog | null {
  let best: ChargeLog | null = null
  for (const c of charges ?? []) if (best === null || c.date >= best.date) best = c
  return best
}

export function daysAgoText(days: number): string {
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

/** "Última cobrança: há 3 dias por WhatsApp" ou null se nunca cobrou. */
export function lastChargeText(charges: ChargeLog[] | undefined, today: IsoDate): string | null {
  const last = lastCharge(charges)
  if (!last) return null
  return `Última cobrança: ${daysAgoText(diffDays(last.date, today))} ${channelVia(last.channel)}`
}

/* ---------- Contato ---------- */

export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Número sem o 55 do Brasil, se vier com ele. */
function nationalPhone(raw: string): string {
  const d = phoneDigits(raw)
  return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d
}

/** DDD + número (10 ou 11 dígitos), com ou sem +55. Vazio é permitido (campo opcional). */
export function isValidPhone(raw: string): boolean {
  if (raw.trim() === '') return true
  const n = nationalPhone(raw)
  return n.length === 10 || n.length === 11
}

export function isValidEmail(raw: string): boolean {
  return raw.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

/** "11987654321" -> "(11) 98765-4321". Se não der para formatar, devolve como está. */
export function formatPhone(raw: string): string {
  const n = nationalPhone(raw)
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return raw.trim()
}

/** Número no formato do WhatsApp (55 + DDD + número) ou null se o telefone não serve. */
export function whatsappNumber(raw: string): string | null {
  if (raw.trim() === '' || !isValidPhone(raw)) return null
  return `55${nationalPhone(raw)}`
}

export function whatsappUrl(phone: string, message: string): string | null {
  const n = whatsappNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null
}

export function mailtoUrl(email: string, subject: string, body: string): string | null {
  const e = email.trim()
  if (e === '' || !isValidEmail(e)) return null
  return `mailto:${e}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/* ---------- Mensagem de cobrança ---------- */

export interface ChargeItem {
  receivable: Receivable
  installments: Installment[]
}

export interface ChargeMessage {
  kind: 'overdue' | 'reminder'
  subject: string
  text: string
  totalCents: number
}

function joinNumbers(nums: number[]): string {
  if (nums.length === 1) return String(nums[0])
  return `${nums.slice(0, -1).join(', ')} e ${nums[nums.length - 1]}`
}

function sumRemaining(installments: Installment[]): number {
  return installments.reduce((acc, i) => acc + installmentRemaining(i), 0)
}

/** Parcelas vencidas e não quitadas, agrupadas por compra (mais antigas primeiro). */
export function overdueItems(receivables: Receivable[], today: IsoDate): ChargeItem[] {
  return receivables
    .map((receivable) => ({
      receivable,
      installments: receivable.installments.filter((i) => !isSettled(i) && i.dueDate < today),
    }))
    .filter((it) => it.installments.length > 0)
}

/** A próxima parcela não quitada de cada compra. */
export function nextItems(receivables: Receivable[]): ChargeItem[] {
  return receivables
    .map((receivable) => ({
      receivable,
      installments: receivable.installments.filter((i) => !isSettled(i)).slice(0, 1),
    }))
    .filter((it) => it.installments.length > 0)
}

/** Como a compra aparece na frase: "(Tênis)" ou "do serviço (Instalação)". */
function ref(r: Receivable): string {
  if (r.kind === 'rateio') return `do rateio (${r.description})`
  return r.kind === 'servico' ? `do serviço (${r.description})` : `(${r.description})`
}

function firstName(person: Person): string {
  return person.name.trim().split(/\s+/)[0] || person.name
}

export const TONE_LABEL: Record<MessageTone, string> = { amigavel: 'Amigável', profissional: 'Profissional' }

export function personTone(person: Pick<Person, 'tone'>): MessageTone {
  return person.tone === 'profissional' ? 'profissional' : 'amigavel'
}

/** Jeito de falar na cobrança: amigável (padrão) ou profissional, escolhido para cada pessoa. */
interface Tone {
  hello: (name: string) => string
  missing: string
  valueOf: string
  ask: string
  thanks: string
  remind: string
  due: string
}

const FRIENDLY: Tone = {
  hello: (name) => `Oi, ${name}! Tudo bem? 😊`,
  missing: 'Não achei aqui o pagamento',
  valueOf: 'de',
  ask: 'Se você já pagou, me avisa que eu dou baixa por aqui! Se ainda não deu, me conta quando consegue?',
  thanks: 'Valeu!',
  remind: 'Só passando pra lembrar',
  due: 'que vence em',
}

const FORMAL: Tone = {
  hello: (name) => `Oi, ${name}! Tudo bem?`,
  missing: 'Não localizei o pagamento',
  valueOf: 'no valor de',
  ask: 'Pode me confirmar se já foi pago ou quando consegue pagar?',
  thanks: 'Obrigado!',
  remind: 'Passando para lembrar',
  due: 'com vencimento em',
}


/**
 * Texto para cobrar. Se há parcela vencida, diz que não achou o pagamento (parcela X de Y, valor).
 * Sem atraso, vira um lembrete da próxima parcela. Sem nada a receber, devolve null.
 */
export function chargeMessage(person: Person, receivables: Receivable[], today: IsoDate): ChargeMessage | null {
  const tone = personTone(person) === 'profissional' ? FORMAL : FRIENDLY
  const hello = tone.hello(firstName(person))
  const overdue = overdueItems(receivables, today)

  if (overdue.length > 0) {
    const total = overdue.reduce((acc, it) => acc + sumRemaining(it.installments), 0)
    const ask = `${tone.ask} ${tone.thanks}`

    if (overdue.length === 1) {
      const { receivable: r, installments } = overdue[0]
      const oldest = installments[0].dueDate
      const word = isOpenEnded(r) ? capital(monthWord(r)) : 'Parcela'
      if (installments.length === 1) {
        return {
          kind: 'overdue',
          subject: `${word} em atraso: ${r.description}`,
          totalCents: total,
          text: `${hello} ${tone.missing} da ${pieces(r, installments)} ${ref(r)}, ${tone.valueOf} ${formatBRL(total)}, que venceu em ${formatDateBR(oldest)}. ${ask}`,
        }
      }
      return {
        kind: 'overdue',
        subject: `${word}s em atraso: ${r.description}`,
        totalCents: total,
        text: `${hello} ${tone.missing} das ${pieces(r, installments)} ${ref(r)}, que somam ${formatBRL(total)} (a mais antiga venceu em ${formatDateBR(oldest)}). ${ask}`,
      }
    }

    const lines = overdue.map(({ receivable: r, installments }) => {
      const sum = formatBRL(sumRemaining(installments))
      const when =
        installments.length === 1
          ? `venceu em ${formatDateBR(installments[0].dueDate)}`
          : `a mais antiga venceu em ${formatDateBR(installments[0].dueDate)}`
      return `• ${r.description}: ${pieces(r, installments)}, ${sum} (${when})`
    })
    return {
      kind: 'overdue',
      subject: 'Parcelas em atraso',
      totalCents: total,
      text: `${hello} ${tone.missing} destas parcelas:\n${lines.join('\n')}\nTotal: ${formatBRL(total)}. ${ask}`,
    }
  }

  const next = nextItems(receivables)
  if (next.length === 0) return null
  const total = next.reduce((acc, it) => acc + sumRemaining(it.installments), 0)
  if (next.length === 1) {
    const { receivable: r, installments } = next[0]
    const i = installments[0]
    return {
      kind: 'reminder',
      subject: `Lembrete de ${isOpenEnded(r) ? monthWord(r) : 'parcela'}: ${r.description}`,
      totalCents: total,
      text: `${hello} ${tone.remind} da ${pieces(r, [i])} ${ref(r)}, de ${formatBRL(total)}, ${tone.due} ${formatDateBR(i.dueDate)}. ${tone.thanks}`,
    }
  }
  const lines = next.map(({ receivable: r, installments }) => {
    const i = installments[0]
    return `• ${r.description}: ${pieces(r, [i])}, ${formatBRL(installmentRemaining(i))}, vence em ${formatDateBR(i.dueDate)}`
  })
  return {
    kind: 'reminder',
    subject: 'Lembrete de parcelas',
    totalCents: total,
    text: `${hello} ${tone.remind} das próximas parcelas:\n${lines.join('\n')}\n${tone.thanks}`,
  }
}

/* ---------- Período do resumo: Mês | Ano | Tudo ---------- */

export type Horizon = 'mes' | 'ano' | 'tudo'
export const HORIZONS: Horizon[] = ['mes', 'ano', 'tudo']
export const HORIZON_LABEL: Record<Horizon, string> = { mes: 'Mês', ano: 'Ano', tudo: 'Tudo' }

/**
 * Recorta as parcelas para o resumo:
 * - Mês: as do mês atual (recebidas ou não) e as atrasadas de antes;
 * - Ano: do mês atual até dezembro, mais as atrasadas;
 * - Tudo: todas as parcelas.
 * O rateio sem fim não tem total: em Ano e Tudo ele vai até dezembro.
 */
export function scopeReceivable(r: Receivable, horizon: Horizon, today: IsoDate): Receivable {
  const thisMonth = competenceOf(today)
  const december = `${thisMonth.slice(0, 4)}-12`
  const full = horizon === 'mes' ? r : extendRecurring(r, december)
  if (horizon === 'tudo') return full
  const last = horizon === 'mes' ? thisMonth : december
  const installments = full.installments.filter((i) => {
    const c = competenceOf(i.dueDate)
    return (c >= thisMonth && c <= last) || (c < thisMonth && !isSettled(i))
  })
  return { ...full, installments }
}

export function scopeReceivables(list: Receivable[], horizon: Horizon, today: IsoDate): Receivable[] {
  return list.map((r) => scopeReceivable(r, horizon, today))
}

/** "neste mês", "até dezembro", "no total" — para os textos do resumo. */
export function horizonPhrase(h: Horizon): string {
  return h === 'mes' ? 'neste mês' : h === 'ano' ? 'até dezembro' : 'no total'
}
