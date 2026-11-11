import type { Competence, IsoDate } from './types'

const TZ = 'America/Sao_Paulo'

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo, independente do fuso do aparelho. */
export function todayInSaoPaulo(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function competenceOf(date: IsoDate): Competence {
  return date.slice(0, 7)
}

function split(c: Competence): [number, number] {
  const [y, m] = c.split('-').map(Number)
  return [y, m]
}

export function addMonths(c: Competence, n: number): Competence {
  const [y, m] = split(c)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Quantos meses de `a` até `b` (negativo se b é anterior). */
export function monthsBetween(a: Competence, b: Competence): number {
  const [ay, am] = split(a)
  const [by, bm] = split(b)
  return (by - ay) * 12 + (bm - am)
}

export function daysInMonth(c: Competence): number {
  const [y, m] = split(c)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Vencimento no mês; dia 31 em fevereiro vira o último dia do mês. */
export function dueDateFor(c: Competence, dueDay: number): IsoDate {
  const day = Math.min(Math.max(1, Math.trunc(dueDay)), daysInMonth(c))
  return `${c}-${String(day).padStart(2, '0')}`
}

/** Dias de `from` até `to` (positivo se `to` é depois). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  const f = Date.parse(`${from}T00:00:00Z`)
  const t = Date.parse(`${to}T00:00:00Z`)
  return Math.round((t - f) / 86_400_000)
}

/** "2026-11-15" -> "15/11/2026" */
export function formatDateBR(d: IsoDate): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

/** "2026-11" -> "novembro de 2026" */
export function formatCompetence(c: Competence): string {
  const [y, m] = split(c)
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
  return `${name} de ${y}`
}

/** "2026-11" -> "nov/2026" */
export function formatCompetenceShort(c: Competence): string {
  const [y, m] = split(c)
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
  return `${name.replace('.', '')}/${y}`
}
