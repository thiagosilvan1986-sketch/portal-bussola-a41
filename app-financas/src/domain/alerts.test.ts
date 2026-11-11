import { describe, expect, it } from 'vitest'
import {
  ALERT_DAY_OPTIONS,
  DEFAULT_ALERTS,
  alertCompetences,
  alertPayload,
  alertsSummary,
  dayChipLabel,
  daysSummary,
  dueSoonLines,
  isAlertTime,
  normalizeAlerts,
  toggleAlertDay,
  upcomingDue,
} from './alerts'
import { buildEntry } from './bills'
import { addDays, hourInSaoPaulo } from './dates'
import type { Bill, Entry } from './types'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 15000,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  ...over,
})

describe('addDays e hourInSaoPaulo', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-11-11', 0)).toBe('2026-11-11')
  })
  it('hora de São Paulo vem do instante, não do fuso da máquina', () => {
    expect(hourInSaoPaulo(new Date('2026-11-11T11:00:00Z'))).toBe(8)
    expect(hourInSaoPaulo(new Date('2026-11-11T02:30:00Z'))).toBe(23)
    expect(hourInSaoPaulo(new Date('2026-11-11T03:00:00Z'))).toBe(0)
  })
})

describe('normalizeAlerts', () => {
  it('sem nada, vale o padrão: ligado, 1 dia antes, às 8h', () => {
    expect(normalizeAlerts(undefined)).toEqual({ enabled: true, days: [1], hour: 8 })
    expect(normalizeAlerts(null)).toEqual(DEFAULT_ALERTS)
  })
  it('mantém o que é válido, ordena e tira repetidos', () => {
    expect(normalizeAlerts({ enabled: false, days: [3, 1, 3, 0], hour: 20 })).toEqual({ enabled: false, days: [0, 1, 3], hour: 20 })
  })
  it('ignora prazos fora da lista, hora inválida e lixo', () => {
    expect(normalizeAlerts({ days: [4, 99, 'x', 1.5], hour: 25 })).toEqual({ enabled: true, days: [1], hour: 8 })
    expect(normalizeAlerts({ hour: 7.5 }).hour).toBe(8)
    expect(normalizeAlerts('texto')).toEqual(DEFAULT_ALERTS)
  })
  it('não devolve a lista padrão compartilhada (não pode ser alterada por fora)', () => {
    normalizeAlerts({}).days.push(7)
    expect(DEFAULT_ALERTS.days).toEqual([1])
  })
})

describe('toggleAlertDay', () => {
  const s = { enabled: true, days: [1], hour: 8 }
  it('marca mais um prazo e mantém a ordem', () => {
    expect(toggleAlertDay(s, 0)?.days).toEqual([0, 1])
    expect(toggleAlertDay({ ...s, days: [1, 7] }, 3)?.days).toEqual([1, 3, 7])
  })
  it('desmarca um prazo', () => {
    expect(toggleAlertDay({ ...s, days: [1, 3] }, 3)?.days).toEqual([1])
  })
  it('não deixa desmarcar o último', () => {
    expect(toggleAlertDay(s, 1)).toBeNull()
  })
  it('prazo que não existe na lista é ignorado', () => {
    expect(toggleAlertDay(s, 4)).toBe(s)
  })
})

describe('textos', () => {
  it('rótulos dos botões', () => {
    expect(ALERT_DAY_OPTIONS.map(dayChipLabel)).toEqual(['No dia', '1 dia', '2 dias', '3 dias', '5 dias', '7 dias', '10 dias', '15 dias'])
  })
  it('resumo dos prazos', () => {
    expect(daysSummary([1])).toBe('1 dia antes')
    expect(daysSummary([3])).toBe('3 dias antes')
    expect(daysSummary([1, 3])).toBe('1 e 3 dias antes')
    expect(daysSummary([1, 3, 7])).toBe('1, 3 e 7 dias antes')
    expect(daysSummary([0])).toBe('No dia do vencimento')
    expect(daysSummary([0, 1])).toBe('No dia, 1 dia antes')
    expect(daysSummary([0, 1, 3])).toBe('No dia, 1 e 3 dias antes')
  })
  it('resumo do menu', () => {
    expect(alertsSummary(DEFAULT_ALERTS)).toBe('1 dia antes · às 08h')
    expect(alertsSummary({ enabled: false, days: [1], hour: 8 })).toBe('Avisos desligados')
  })
})

describe('upcomingDue', () => {
  const today = '2026-11-09'

  it('acha a conta que vence amanhã e ignora as outras datas', () => {
    const bills = [bill({ id: 'a', name: 'Energia', dueDay: 10 }), bill({ id: 'b', name: 'Internet', dueDay: 15 })]
    expect(upcomingDue(bills, [], today, [1])).toEqual([{ billId: 'a', name: 'Energia', dueDate: '2026-11-10', daysLeft: 1 }])
  })

  it('vale para vários prazos e ordena do mais perto ao mais longe, depois por nome', () => {
    const bills = [
      bill({ id: 'a', name: 'Internet', dueDay: 12 }),
      bill({ id: 'b', name: 'Água', dueDay: 10 }),
      bill({ id: 'c', name: 'Aluguel', dueDay: 12 }),
      bill({ id: 'd', name: 'Hoje', dueDay: 9 }),
    ]
    const found = upcomingDue(bills, [], today, [0, 1, 3])
    expect(found.map((i) => [i.name, i.daysLeft])).toEqual([
      ['Hoje', 0],
      ['Água', 1],
      ['Aluguel', 3],
      ['Internet', 3],
    ])
  })

  it('usa o lançamento existente: conta já paga não avisa', () => {
    const b = bill()
    const paid: Entry = { ...buildEntry(b, '2026-11'), paidAt: '2026-11-08', paidAmountCents: 15000 }
    expect(upcomingDue([b], [paid], today, [1])).toEqual([])
    const open = buildEntry(b, '2026-11')
    expect(upcomingDue([b], [open], today, [1])).toHaveLength(1)
  })

  it('pagamento parcial ainda avisa', () => {
    const b = bill()
    const partial: Entry = { ...buildEntry(b, '2026-11'), paidAt: '2026-11-08', paidAmountCents: 5000 }
    expect(upcomingDue([b], [partial], today, [1])).toHaveLength(1)
  })

  it('usa o vencimento editado no lançamento', () => {
    const b = bill()
    const moved: Entry = { ...buildEntry(b, '2026-11'), dueDate: '2026-11-12' }
    expect(upcomingDue([b], [moved], today, [1])).toEqual([])
    expect(upcomingDue([b], [moved], today, [3])).toHaveLength(1)
  })

  it('atravessa o mês e o ano, mesmo sem o lançamento do mês seguinte existir', () => {
    const b = bill({ dueDay: 1 })
    expect(upcomingDue([b], [], '2026-12-31', [1])).toEqual([{ billId: 'b1', name: 'Energia', dueDate: '2027-01-01', daysLeft: 1 }])
    expect(upcomingDue([b], [], '2026-11-30', [1])[0].dueDate).toBe('2026-12-01')
  })

  it('dia 31 num mês de 30 dias vence no último dia', () => {
    expect(upcomingDue([bill({ dueDay: 31 })], [], '2026-11-29', [1]).map((i) => i.dueDate)).toEqual(['2026-11-30'])
  })

  it('respeita conta arquivada, mês excluído, periodicidade e fim das parcelas', () => {
    expect(upcomingDue([bill({ active: false })], [], today, [1])).toEqual([])
    expect(upcomingDue([bill({ skippedMonths: ['2026-11'] })], [], today, [1])).toEqual([])
    expect(upcomingDue([bill({ recurrence: 'quarterly', startMonth: '2026-01' })], [], today, [1])).toEqual([])
    expect(upcomingDue([bill({ recurrence: 'quarterly', startMonth: '2026-02' })], [], today, [1])).toHaveLength(1)
    expect(upcomingDue([bill({ startMonth: '2026-01', installmentCount: 10 })], [], today, [1])).toEqual([])
    expect(upcomingDue([bill({ startMonth: '2026-01', installmentCount: 11 })], [], today, [1])).toHaveLength(1)
  })

  it('sem prazos, não acha nada', () => {
    expect(upcomingDue([bill()], [], today, [])).toEqual([])
  })
})

describe('alertCompetences', () => {
  it('só o mês de hoje quando o prazo não passa do mês', () => {
    expect(alertCompetences('2026-11-09', [1])).toEqual(['2026-11'])
  })
  it('inclui o mês seguinte quando o prazo atravessa', () => {
    expect(alertCompetences('2026-11-30', [1])).toEqual(['2026-11', '2026-12'])
    expect(alertCompetences('2026-11-20', [0, 15])).toEqual(['2026-11', '2026-12'])
  })
})

describe('mensagens', () => {
  const items = [
    { billId: 'a', name: 'Água', dueDate: '2026-11-10', daysLeft: 1 },
    { billId: 'b', name: 'Luz', dueDate: '2026-11-10', daysLeft: 1 },
    { billId: 'c', name: 'Internet', dueDate: '2026-11-12', daysLeft: 3 },
  ]
  it('notificação agrupa por prazo, sem valores', () => {
    expect(alertPayload(items)).toEqual({
      title: '3 contas estão perto de vencer',
      body: 'Amanhã: Água, Luz · Em 3 dias: Internet',
      url: '/',
      tag: 'vencimentos',
    })
  })
  it('uma conta só', () => {
    const one = alertPayload([{ billId: 'a', name: 'Água', dueDate: '2026-11-09', daysLeft: 0 }])
    expect(one?.title).toBe('Uma conta está perto de vencer')
    expect(one?.body).toBe('Hoje: Água')
  })
  it('nada a avisar, nada de notificação', () => {
    expect(alertPayload([])).toBeNull()
  })
  it('faixa do Início: uma frase por prazo e sem quem vence hoje', () => {
    expect(dueSoonLines([{ billId: 'z', name: 'Hoje', dueDate: '2026-11-09', daysLeft: 0 }, ...items])).toEqual([
      'Vence amanhã: Água, Luz',
      'Vence em 3 dias: Internet',
    ])
    expect(dueSoonLines([])).toEqual([])
  })
})

describe('isAlertTime', () => {
  const s = { enabled: true, days: [1], hour: 8 }
  it('só a partir da hora escolhida', () => {
    expect(isAlertTime(s, 7, '2026-11-09', null)).toBe(false)
    expect(isAlertTime(s, 8, '2026-11-09', null)).toBe(true)
    expect(isAlertTime(s, 15, '2026-11-09', '2026-11-08')).toBe(true)
  })
  it('uma vez por dia', () => {
    expect(isAlertTime(s, 9, '2026-11-09', '2026-11-09')).toBe(false)
  })
  it('desligado nunca', () => {
    expect(isAlertTime({ ...s, enabled: false }, 12, '2026-11-09', null)).toBe(false)
  })
})
