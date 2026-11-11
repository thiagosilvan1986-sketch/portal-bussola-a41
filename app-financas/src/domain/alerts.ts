import { billAppliesTo, buildEntry, entryId } from './bills'
import { addDays, competenceOf } from './dates'
import { isPending } from './entries'
import type { Bill, Entry, IsoDate } from './types'

/**
 * Avisos de vencimento: quantos dias antes e a que horas. Tudo aqui é função pura, usada pelo app
 * (faixa no Início, tela de Cadastros) e também pelo servidor que manda a notificação com o app fechado.
 */

export interface AlertSettings {
  /** Chave geral: desligada, não há faixa no Início nem notificação. */
  enabled: boolean
  /** Antecedências escolhidas, em dias, em ordem crescente (0 = no dia do vencimento). Nunca fica vazia. */
  days: number[]
  /** Hora cheia (0 a 23), no horário de Brasília, em que a notificação do dia sai. */
  hour: number
}

/** Antecedências que a pessoa pode marcar. */
export const ALERT_DAY_OPTIONS: readonly number[] = [0, 1, 2, 3, 5, 7, 10, 15]
export const MAX_ALERT_DAYS = 15

export const DEFAULT_ALERTS: AlertSettings = { enabled: true, days: [1], hour: 8 }

/** Lê o que veio do Firestore (ou nada) e devolve configurações sempre válidas. */
export function normalizeAlerts(raw: unknown): AlertSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.filter((d): d is number => typeof d === 'number' && ALERT_DAY_OPTIONS.includes(d)))].sort((a, b) => a - b)
    : []
  const hour = typeof r.hour === 'number' && Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23 ? r.hour : DEFAULT_ALERTS.hour
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_ALERTS.enabled,
    days: days.length > 0 ? days : [...DEFAULT_ALERTS.days],
    hour,
  }
}

/** Marca ou desmarca uma antecedência. Devolve null se isso deixaria a lista vazia (precisa sobrar pelo menos uma). */
export function toggleAlertDay(settings: AlertSettings, day: number): AlertSettings | null {
  if (!ALERT_DAY_OPTIONS.includes(day)) return settings
  const has = settings.days.includes(day)
  const days = has ? settings.days.filter((d) => d !== day) : [...settings.days, day].sort((a, b) => a - b)
  return days.length === 0 ? null : { ...settings, days }
}

/** Texto do botão de cada antecedência: "No dia", "1 dia", "2 dias". */
export function dayChipLabel(day: number): string {
  return day === 0 ? 'No dia' : day === 1 ? '1 dia' : `${day} dias`
}

const joinList = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`)

/** "1 dia antes", "1 e 3 dias antes", "No dia, 1 e 3 dias antes", "No dia do vencimento". */
export function daysSummary(days: readonly number[]): string {
  const before = days.filter((d) => d > 0)
  const onDay = days.includes(0)
  if (before.length === 0) return 'No dia do vencimento'
  const list = joinList(before.map(String))
  const text = `${list} ${before.length === 1 && before[0] === 1 ? 'dia' : 'dias'} antes`
  return onDay ? `No dia, ${text}` : text
}

export const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}h`

/** Resumo de uma linha para o menu de Cadastros. */
export function alertsSummary(settings: AlertSettings): string {
  return settings.enabled ? `${daysSummary(settings.days)} · às ${formatHour(settings.hour)}` : 'Avisos desligados'
}

/** Uma conta que vence dentro de uma das antecedências escolhidas. */
export interface DueItem {
  billId: string
  name: string
  dueDate: IsoDate
  /** Dias de hoje até o vencimento (0 = hoje). */
  daysLeft: number
}

/**
 * Contas ainda não pagas que vencem exatamente daqui a um dos `days` dias. Parte das contas cadastradas (o lançamento do
 * mês seguinte pode ainda não existir) e usa o lançamento de verdade quando ele existe, para respeitar pagamentos e
 * vencimentos editados.
 */
export function upcomingDue(bills: Bill[], entries: Entry[], today: IsoDate, days: readonly number[]): DueItem[] {
  if (days.length === 0) return []
  const wanted = new Map(days.map((d) => [addDays(today, d), d]))
  const competences = new Set([...wanted.keys()].map(competenceOf))
  const existing = new Map(entries.map((e) => [e.id, e]))
  const items: DueItem[] = []
  for (const bill of bills) {
    for (const competence of competences) {
      if (!billAppliesTo(bill, competence)) continue
      const entry = existing.get(entryId(bill.id, competence)) ?? buildEntry(bill, competence)
      const daysLeft = wanted.get(entry.dueDate)
      if (daysLeft === undefined || !isPending(entry)) continue
      items.push({ billId: bill.id, name: entry.billName, dueDate: entry.dueDate, daysLeft })
    }
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, 'pt-BR'))
}

/** As competências cujos lançamentos `upcomingDue` pode precisar (hoje e o dia mais distante do aviso). */
export function alertCompetences(today: IsoDate, days: readonly number[]): string[] {
  const last = addDays(today, Math.max(0, ...days))
  return [...new Set([competenceOf(today), competenceOf(last)])]
}

const whenLabel = (daysLeft: number) => (daysLeft === 0 ? 'Hoje' : daysLeft === 1 ? 'Amanhã' : `Em ${daysLeft} dias`)

function grouped(items: DueItem[]): { daysLeft: number; names: string[] }[] {
  const groups: { daysLeft: number; names: string[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.daysLeft === item.daysLeft) last.names.push(item.name)
    else groups.push({ daysLeft: item.daysLeft, names: [item.name] })
  }
  return groups
}

/** Conteúdo da notificação. Só nomes e prazos, sem valores: a tela bloqueada do celular pode estar à vista de outras pessoas. */
export interface PushPayload {
  title: string
  body: string
  /** Para onde o toque na notificação leva dentro do app. */
  url: string
  /** Notificações com a mesma tag se substituem em vez de empilhar. */
  tag: string
}

export function alertPayload(items: DueItem[]): PushPayload | null {
  if (items.length === 0) return null
  return {
    title: items.length === 1 ? 'Uma conta está perto de vencer' : `${items.length} contas estão perto de vencer`,
    body: grouped(items)
      .map((g) => `${whenLabel(g.daysLeft)}: ${g.names.join(', ')}`)
      .join(' · '),
    url: '/',
    tag: 'vencimentos',
  }
}

export const TEST_PAYLOAD: PushPayload = {
  title: 'Aviso de teste',
  body: 'Deu certo! É assim que o Contas em Dia vai avisar quando uma conta estiver perto de vencer.',
  url: '/cadastros/alertas',
  tag: 'teste',
}

/** Frases da faixa no Início, uma por prazo ("Vence amanhã: Luz, Água"). Quem vence hoje já tem a própria faixa. */
export function dueSoonLines(items: DueItem[]): string[] {
  return grouped(items.filter((i) => i.daysLeft > 0)).map(
    (g) => `Vence ${g.daysLeft === 1 ? 'amanhã' : `em ${g.daysLeft} dias`}: ${g.names.join(', ')}`,
  )
}

/** Já é hora de mandar a notificação de hoje? Vale a partir da hora escolhida e uma vez por dia (se a hora exata falhar, sai na seguinte). */
export function isAlertTime(settings: AlertSettings, hourNow: number, today: IsoDate, lastSent: IsoDate | null): boolean {
  return settings.enabled && hourNow >= settings.hour && lastSent !== today
}
