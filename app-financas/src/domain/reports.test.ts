import { describe, expect, it } from 'vitest'
import { buildEntry } from './bills'
import { buildInstallments, withPayment } from './receivables'
import {
  byCategory,
  compactBRL,
  entriesWithProjection,
  expectedBalance,
  monthlyReport,
  niceCeil,
  percentDone,
  periodMonths,
  periodOf,
  periodSpan,
  periodTitle,
  realizedBalance,
  samePeriod,
  shiftPeriod,
  sumMonths,
  topDebtors,
} from './reports'
import type { Bill, Entry, Person, Receivable } from './types'

const TODAY = '2026-11-11'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 20000,
  dueDay: 5,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  skippedMonths: [],
  ...over,
})

const entry = (b: Bill, competence: string, over: Partial<Entry> = {}): Entry => ({ ...buildEntry(b, competence), ...over })

describe('períodos', () => {
  it('acha o trimestre, o semestre e o ano de uma data', () => {
    expect(periodOf('trimestre', '2026-11-11')).toEqual({ kind: 'trimestre', year: 2026, index: 4 })
    expect(periodOf('trimestre', '2026-07-01')).toEqual({ kind: 'trimestre', year: 2026, index: 3 })
    expect(periodOf('semestre', '2026-06-30')).toEqual({ kind: 'semestre', year: 2026, index: 1 })
    expect(periodOf('semestre', '2026-07-01')).toEqual({ kind: 'semestre', year: 2026, index: 2 })
    expect(periodOf('ano', '2026-02-10')).toEqual({ kind: 'ano', year: 2026, index: 1 })
  })

  it('lista os meses de cada período', () => {
    expect(periodMonths(periodOf('trimestre', '2026-11-11'))).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(periodMonths(periodOf('semestre', '2026-11-11'))).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
    expect(periodMonths(periodOf('ano', '2026-11-11'))).toHaveLength(12)
    expect(periodMonths(periodOf('ano', '2026-11-11'))[0]).toBe('2026-01')
  })

  it('anda para frente e para trás atravessando o ano', () => {
    const q4 = periodOf('trimestre', '2026-11-11')
    expect(shiftPeriod(q4, 1)).toEqual({ kind: 'trimestre', year: 2027, index: 1 })
    expect(shiftPeriod(q4, -4)).toEqual({ kind: 'trimestre', year: 2025, index: 4 })
    const h1 = periodOf('semestre', '2026-02-01')
    expect(shiftPeriod(h1, -1)).toEqual({ kind: 'semestre', year: 2025, index: 2 })
    expect(shiftPeriod(periodOf('ano', '2026-02-01'), -1).year).toBe(2025)
    expect(samePeriod(shiftPeriod(q4, 3), shiftPeriod(shiftPeriod(q4, 1), 2))).toBe(true)
  })

  it('dá títulos legíveis', () => {
    expect(periodTitle(periodOf('trimestre', '2026-11-11'))).toBe('4º trimestre de 2026')
    expect(periodTitle(periodOf('semestre', '2026-11-11'))).toBe('2º semestre de 2026')
    expect(periodTitle(periodOf('ano', '2026-11-11'))).toBe('2026')
    expect(periodSpan(periodOf('trimestre', '2026-11-11'))).toBe('out a dez')
  })
})

describe('relatório mês a mês', () => {
  const months = ['2026-09', '2026-10', '2026-11']
  const energia = bill()
  const entries: Entry[] = [
    entry(energia, '2026-09', { paidAt: '2026-09-05', paidAmountCents: 20000 }),
    entry(energia, '2026-10', { chargedAmountCents: 25000 }), // venceu dia 5/10 e não foi paga: atrasada
    entry(energia, '2026-11', { paidAt: '2026-11-04', paidAmountCents: 5000 }), // paga só 50,00 de 200,00 (parcial)
  ]
  const receivable: Receivable = {
    id: 'r1',
    personId: 'p1',
    kind: 'cartao',
    description: 'Tênis',
    totalCents: 30000,
    installmentCount: 3,
    firstDueDate: '2026-09-10',
    installments: withPayment(buildInstallments(30000, 3, '2026-09-10'), 1, { paidAt: '2026-09-10', paidAmountCents: 10000 }),
    notes: '',
  }

  it('soma o que paga e o que recebe em cada mês', () => {
    const rows = monthlyReport(months, entries, [receivable], TODAY)
    expect(rows[0]).toMatchObject({ payTotalCents: 20000, payPaidCents: 20000, payOpenCents: 0, recvTotalCents: 10000, recvReceivedCents: 10000, recvOpenCents: 0 })
    // outubro: cobrado 250,00, nada pago, atrasado; parcela 2 (10/10) em aberto e atrasada
    expect(rows[1]).toMatchObject({ payTotalCents: 25000, payPaidCents: 0, payOpenCents: 25000, payOverdueCents: 25000, recvTotalCents: 10000, recvOpenCents: 10000, recvOverdueCents: 10000 })
    // novembro: parcial; falta 150,00, que venceu dia 5 (atrasado); parcela 3 vence dia 10: atrasada
    expect(rows[2]).toMatchObject({ payTotalCents: 20000, payPaidCents: 5000, payOpenCents: 15000, payOverdueCents: 15000, recvOpenCents: 10000, recvOverdueCents: 10000 })
  })

  it('totais e saldos do período', () => {
    const t = sumMonths(monthlyReport(months, entries, [receivable], TODAY))
    expect(t.payTotalCents).toBe(65000)
    expect(t.payPaidCents).toBe(25000)
    expect(t.recvTotalCents).toBe(30000)
    expect(t.recvReceivedCents).toBe(10000)
    expect(expectedBalance(t)).toBe(-35000) // vai faltar
    expect(realizedBalance(t)).toBe(-15000)
  })

  it('ignora o que está fora dos meses pedidos', () => {
    const rows = monthlyReport(['2026-12'], entries, [receivable], TODAY)
    expect(rows[0].payTotalCents).toBe(0)
    expect(rows[0].recvTotalCents).toBe(0)
  })

  it('percentual cumprido tem teto de 100 e trata total zero', () => {
    expect(percentDone(25000, 65000)).toBe(38)
    expect(percentDone(10, 5)).toBe(100)
    expect(percentDone(0, 0)).toBe(0)
  })
})

describe('previsão dos meses sem lançamento', () => {
  const months = ['2026-10', '2026-11', '2026-12']

  it('projeta só de hoje em diante; meses passados nunca são inventados', () => {
    const real = [entry(bill(), '2026-11')]
    const { entries, projectedMonths } = entriesWithProjection(real, [bill()], months, TODAY)
    expect(entries.map((e) => e.competence).sort()).toEqual(['2026-11', '2026-12'])
    expect([...projectedMonths]).toEqual(['2026-12'])
  })

  it('respeita contas arquivadas e meses excluídos', () => {
    const { entries } = entriesWithProjection([], [bill({ active: false }), bill({ id: 'b2', skippedMonths: ['2026-12'] })], months, TODAY)
    expect(entries.map((e) => `${e.billId}_${e.competence}`)).toEqual(['b2_2026-11'])
  })

  it('conta parcelada para de ser prevista depois da última parcela', () => {
    const financiamento = bill({ id: 'b3', startMonth: '2026-10', installmentCount: 2 }) // out e nov
    const { entries } = entriesWithProjection([], [financiamento], months, TODAY)
    expect(entries.map((e) => e.competence)).toEqual(['2026-11'])
    expect(entries[0]).toMatchObject({ installmentNumber: 2, installmentTotal: 2 })
  })

  it('marca o mês como previsto no relatório', () => {
    const { entries, projectedMonths } = entriesWithProjection([], [bill()], months, TODAY)
    const rows = monthlyReport(months, entries, [], TODAY, projectedMonths)
    expect(rows.map((r) => r.projected)).toEqual([false, true, true])
    expect(rows[2].payTotalCents).toBe(20000)
  })
})

describe('detalhamentos', () => {
  it('agrupa por categoria, ordena e junta as menores em "Outras categorias"', () => {
    const cats = ['A', 'B', 'C', 'D']
    const list = cats.map((category, k) => entry(bill({ id: `x${k}`, category, expectedAmountCents: (4 - k) * 10000 }), '2026-11'))
    const out = byCategory(list, ['2026-11'], 2)
    expect(out.map((c) => [c.category, c.totalCents, c.share])).toEqual([
      ['A', 40000, 40],
      ['B', 30000, 30],
      ['Outras categorias', 30000, 30],
    ])
  })

  it('sem lançamentos, não há categorias', () => {
    expect(byCategory([], ['2026-11'])).toEqual([])
    expect(byCategory([entry(bill({ expectedAmountCents: 0 }), '2026-11')], ['2026-11'])).toEqual([])
  })

  it('ranking de quem mais deve no período, com o atraso separado', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Ana', phone: '', email: '', charges: [] },
      { id: 'p2', name: 'Bruno', phone: '', email: '', charges: [] },
    ]
    const mk = (id: string, personId: string, total: number, first: string): Receivable => ({
      id,
      personId,
      kind: 'cartao',
      description: id,
      totalCents: total,
      installmentCount: 1,
      firstDueDate: first,
      installments: buildInstallments(total, 1, first),
      notes: '',
    })
    const rows = topDebtors([mk('r1', 'p1', 5000, '2026-11-05'), mk('r2', 'p2', 9000, '2026-12-05'), mk('r3', 'p2', 1000, '2027-03-01')], people, ['2026-11', '2026-12'], TODAY)
    expect(rows).toEqual([
      { personId: 'p2', name: 'Bruno', openCents: 9000, overdueCents: 0 },
      { personId: 'p1', name: 'Ana', openCents: 5000, overdueCents: 5000 },
    ])
  })
})

describe('eixo do gráfico', () => {
  it('abrevia valores', () => {
    expect(compactBRL(85000)).toBe('R$ 850')
    expect(compactBRL(150000)).toBe('R$ 1,5 mil')
    expect(compactBRL(1250000)).toBe('R$ 13 mil')
    expect(compactBRL(0)).toBe('R$ 0')
    expect(compactBRL(-1500000)).toBe('−R$ 15 mil')
    expect(compactBRL(-85000)).toBe('−R$ 850')
  })

  it('arredonda o teto do eixo para um número fácil de ler', () => {
    expect(niceCeil(0)).toBe(10000)
    expect(niceCeil(83000)).toBe(100000)
    expect(niceCeil(120000)).toBe(200000)
    expect(niceCeil(210000)).toBe(300000)
    expect(niceCeil(260000)).toBe(300000)
    expect(niceCeil(500000)).toBe(500000)
    expect(niceCeil(532500)).toBe(600000)
    expect(niceCeil(700000)).toBe(800000)
  })
})
