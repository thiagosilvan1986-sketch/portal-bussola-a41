import { describe, expect, it } from 'vitest'
import { buildEntry } from './bills'
import { layoutFlow } from './flowLayout'
import { buildInstallments } from './receivables'
import {
  OTHER_CATEGORIES,
  categoryEntries,
  categorySlices,
  categoryTrend,
  coverage,
  cumulativeSeries,
  dueDayMap,
  firstShortfall,
  flowModel,
  heatLevel,
  monthlyReport,
  percentChange,
  rankCategories,
  savingsRate,
  sliceOf,
} from './reports'
import type { Bill, Entry, Receivable } from './types'

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
const recv = (id: string, total: number, first: string, count = 1): Receivable => ({
  id,
  personId: 'p1',
  kind: 'servico',
  description: id,
  totalCents: total,
  installmentCount: count,
  firstDueDate: first,
  installments: buildInstallments(total, count, first),
  notes: '',
})

describe('comparação e taxas', () => {
  it('variação percentual contra o período anterior', () => {
    expect(percentChange(12000, 10000)).toBe(20)
    expect(percentChange(8000, 10000)).toBe(-20)
    expect(percentChange(10000, 10000)).toBe(0)
    expect(percentChange(5000, 0)).toBeNull()
  })

  it('taxa de sobra só existe quando entra dinheiro e não falta', () => {
    expect(savingsRate({ recvTotalCents: 100000, payTotalCents: 80000 })).toBe(20)
    expect(savingsRate({ recvTotalCents: 100000, payTotalCents: 100000 })).toBe(0)
    expect(savingsRate({ recvTotalCents: 100000, payTotalCents: 150000 })).toBeNull()
    expect(savingsRate({ recvTotalCents: 0, payTotalCents: 50000 })).toBeNull()
  })

  it('cobertura: quanto do que sai o que entra paga', () => {
    expect(coverage({ recvTotalCents: 30000, payTotalCents: 360000 })).toBe(8)
    expect(coverage({ recvTotalCents: 90000, payTotalCents: 60000 })).toBe(150)
    expect(coverage({ recvTotalCents: 90000, payTotalCents: 0 })).toBeNull()
  })
})

describe('acumulado', () => {
  const months = ['2026-10', '2026-11', '2026-12']
  const entries = [entry(bill(), '2026-10'), entry(bill(), '2026-11'), entry(bill(), '2026-12')]
  const rows = monthlyReport(months, entries, [recv('r1', 30000, '2026-10-10', 3)], TODAY)

  it('em "tudo" é o saldo que se acumula e pode ficar negativo', () => {
    // mês: 100 − 200 = −100, depois −200, −300 (acumulado)
    expect(cumulativeSeries(rows, 'tudo')).toEqual([-10000, -20000, -30000])
  })

  it('em "pagar" e "receber" é o total que vai se somando', () => {
    expect(cumulativeSeries(rows, 'pagar')).toEqual([20000, 40000, 60000])
    expect(cumulativeSeries(rows, 'receber')).toEqual([10000, 20000, 30000])
  })

  it('acha o primeiro mês em que falta dinheiro', () => {
    expect(firstShortfall(rows, cumulativeSeries(rows, 'tudo'))).toBe('2026-10')
    expect(firstShortfall(rows, [5000, 4000, 100])).toBeNull()
    expect(firstShortfall(rows, [5000, -1, -100])).toBe('2026-11')
  })
})

describe('mapa de vencimentos', () => {
  const months = ['2026-10', '2026-11']
  const entries = [
    entry(bill({ id: 'a', dueDay: 5 }), '2026-10'),
    entry(bill({ id: 'a', dueDay: 5 }), '2026-11'),
    entry(bill({ id: 'b', dueDay: 10, expectedAmountCents: 100000 }), '2026-11'),
    entry(bill({ id: 'c', dueDay: 20 }), '2026-12'), // fora do período
  ]

  it('soma o que vence em cada dia do mês, nos 31 dias', () => {
    const map = dueDayMap(entries, [], months, 'pagar')
    expect(map).toHaveLength(31)
    expect(map[4]).toMatchObject({ day: 5, totalCents: 40000, count: 2 })
    expect(map[4].items.map((i) => [i.name, i.dueDate, i.cents])).toEqual([
      ['Energia', '2026-10-05', 20000],
      ['Energia', '2026-11-05', 20000],
    ])
    expect(map[9]).toMatchObject({ day: 10, totalCents: 100000, count: 1 })
    expect(map[19].count).toBe(0)
  })

  it('para o que se recebe, usa o vencimento de cada parcela', () => {
    const map = dueDayMap([], [recv('r1', 30000, '2026-10-12', 3)], months, 'receber', [{ id: 'p1', name: 'Ana', phone: '', email: '', charges: [] }])
    expect(map[11]).toMatchObject({ day: 12, totalCents: 20000, count: 2 })
    expect(map[11].items.map((i) => i.name)).toEqual(['Ana · r1 1/3', 'Ana · r1 2/3'])
    expect(map.filter((d) => d.count > 0)).toHaveLength(1)
  })

  it('cada vencimento traz a situação do pagamento e quanto falta pagar', () => {
    const list = [
      entry(bill({ id: 'a', dueDay: 5 }), '2026-10', { paidAt: '2026-10-05', paidAmountCents: 20000 }), // paga
      entry(bill({ id: 'b', dueDay: 5 }), '2026-10', { paidAt: '2026-10-05', paidAmountCents: 5000 }), // parcial
      entry(bill({ id: 'c', dueDay: 5 }), '2026-11'), // venceu antes de hoje (11/11): atrasada
      entry(bill({ id: 'd', dueDay: 5 }), '2026-12'), // futura: pendente, ainda sem aviso de atraso
    ]
    const items = dueDayMap(list, [], ['2026-10', '2026-11', '2026-12'], 'pagar', [], { today: TODAY }).flatMap((d) => d.items)
    expect(items.map((i) => [i.billId, i.status, i.pendingCents])).toEqual([
      ['a', 'paga', 0],
      ['b', 'parcial', 15000],
      ['c', 'atrasada', 20000],
      ['d', 'prevista', 20000],
    ])
    expect(items[2]).toMatchObject({ kind: 'conta', entryId: 'c_2026-11', projected: false })
  })

  it('resume o dia: quantos vencimentos ainda estão pendentes e quantos atrasados', () => {
    const list = [
      entry(bill({ id: 'a', dueDay: 5 }), '2026-10', { paidAt: '2026-10-05', paidAmountCents: 20000 }),
      entry(bill({ id: 'b', dueDay: 5 }), '2026-11'),
      entry(bill({ id: 'c', dueDay: 5 }), '2026-12'),
    ]
    const day = dueDayMap(list, [], ['2026-10', '2026-11', '2026-12'], 'pagar', [], { today: TODAY })[4]
    expect(day).toMatchObject({ count: 3, totalCents: 60000, pendingCount: 2, pendingCents: 40000, overdueCount: 1 })
  })

  it('a situação vem do lançamento gravado e o que não está gravado é previsão', () => {
    const gravado = entry(bill({ id: 'a', dueDay: 5 }), '2026-11', { paidAt: '2026-11-05', paidAmountCents: 20000 })
    const previsto = entry(bill({ id: 'b', dueDay: 5 }), '2026-12')
    // o valor do mapa pode vir descontado dos reembolsos (aqui, sem o pagamento); a situação não muda por isso
    const descontado = { ...gravado, paidAt: null, paidAmountCents: null }
    const items = dueDayMap([descontado, previsto], [], ['2026-11', '2026-12'], 'pagar', [], {
      today: TODAY,
      recorded: new Map([[gravado.id, gravado]]),
    }).flatMap((d) => d.items)
    expect(items.map((i) => [i.billId, i.status, i.projected])).toEqual([
      ['a', 'paga', false],
      ['b', 'prevista', true],
    ])
  })

  it('a parcela a receber traz a situação, a pessoa e a compra para abrir', () => {
    const r = recv('r1', 30000, '2026-10-12', 3)
    r.installments = r.installments.map((i) => (i.number === 1 ? { ...i, paidAt: '2026-10-12', paidAmountCents: i.amountCents } : i))
    const items = dueDayMap([], [r], ['2026-10', '2026-11', '2026-12'], 'receber', [], { today: TODAY }).flatMap((d) => d.items)
    expect(items.map((i) => [i.installmentNumber, i.status, i.pendingCents])).toEqual([
      [1, 'paga', 0],
      [2, 'vence_em_breve', 10000], // vence amanhã (12/11)
      [3, 'prevista', 10000],
    ])
    expect(items[1]).toMatchObject({ kind: 'parcela', personId: 'p1', receivableId: 'r1' })
  })

  it('classifica o dia em níveis de 0 a 5 pela proporção do dia mais carregado', () => {
    expect(heatLevel(0, 100000)).toBe(0)
    expect(heatLevel(100000, 100000)).toBe(5)
    expect(heatLevel(1, 100000)).toBe(1)
    expect(heatLevel(50000, 100000)).toBe(3)
    expect(heatLevel(500, 0)).toBe(0)
  })
})

describe('categorias', () => {
  const months = ['2026-10', '2026-11']
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  const entries = names.flatMap((category, k) => [
    entry(bill({ id: `x${k}`, category, expectedAmountCents: (8 - k) * 10000, dueDay: k + 1 }), '2026-10'),
    entry(bill({ id: `x${k}`, category, expectedAmountCents: (8 - k) * 10000, dueDay: k + 1 }), '2026-11'),
  ])

  it('ranqueia todas as categorias, da maior para a menor', () => {
    expect(rankCategories(entries, months).map((c) => c.category)).toEqual(names)
    expect(rankCategories(entries, ['2025-01'])).toEqual([])
  })

  it('as 5 maiores viram fatias com posição na paleta e as outras se juntam', () => {
    const slices = categorySlices(entries, months, 5)
    expect(slices.map((s) => s.category)).toEqual(['A', 'B', 'C', 'D', 'E', OTHER_CATEGORIES])
    expect(slices.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, null])
    expect(slices[5].members).toEqual(['F', 'G'])
    expect(slices[5].totalCents).toBe((3 + 2) * 10000 * 2)
  })

  it('sem categorias a mais, não cria "Outras categorias"', () => {
    const slices = categorySlices(entries.slice(0, 6), months, 5)
    expect(slices.map((s) => s.category)).toEqual(['A', 'B', 'C'])
  })

  it('acha a fatia de uma categoria, mesmo quando ela está em "Outras categorias"', () => {
    const slices = categorySlices(entries, months, 5)
    expect(sliceOf(slices, 'B')?.category).toBe('B')
    expect(sliceOf(slices, 'G')?.category).toBe(OTHER_CATEGORIES)
    expect(sliceOf(slices, null)).toBeNull()
    expect(sliceOf(slices, 'Inexistente')).toBeNull()
  })

  it('lista as contas da categoria por vencimento e mostra a evolução mês a mês', () => {
    const list = categoryEntries(entries, months, ['F', 'G'])
    expect(list.map((e) => e.category)).toEqual(['F', 'G', 'F', 'G']) // out: F (dia 6), G (dia 7); nov: F, G
    expect(list.map((e) => e.dueDate)).toEqual(list.map((e) => e.dueDate).toSorted())
    expect(categoryTrend(entries, months, ['F', 'G'])).toEqual([50000, 50000])
    expect(categoryTrend(entries, ['2026-09', '2026-10'], ['A'])).toEqual([0, 80000])
  })
})

describe('fluxo do dinheiro', () => {
  const months = ['2026-11']
  const entries = [entry(bill({ id: 'a', category: 'Moradia', expectedAmountCents: 60000 }), '2026-11'), entry(bill({ id: 'b', category: 'Lazer', expectedAmountCents: 20000 }), '2026-11')]
  const slices = categorySlices(entries, months)

  it('quando sobra, a sobra é um destino e os dois lados fecham', () => {
    const flow = flowModel(slices, 100000)!
    expect(flow.sources.map((s) => [s.kind, s.cents])).toEqual([['recv', 100000]])
    expect(flow.targets.map((t) => [t.label, t.cents])).toEqual([
      ['Moradia', 60000],
      ['Lazer', 20000],
      ['Sobra', 20000],
    ])
    expect(flow.totalCents).toBe(100000)
  })

  it('quando falta, a falta é uma origem e os dois lados fecham', () => {
    const flow = flowModel(slices, 50000)!
    expect(flow.sources.map((s) => [s.kind, s.cents])).toEqual([
      ['recv', 50000],
      ['gap', 30000],
    ])
    expect(flow.targets.map((t) => t.kind)).toEqual(['category', 'category'])
    expect(flow.totalCents).toBe(80000)
  })

  it('sem nada a receber, só a falta alimenta as categorias', () => {
    const flow = flowModel(slices, 0)!
    expect(flow.sources.map((s) => s.kind)).toEqual(['gap'])
    expect(flow.sources[0].cents).toBe(80000)
  })

  it('sem contas a pagar não há fluxo', () => {
    expect(flowModel([], 100000)).toBeNull()
  })
})

describe('posição do fluxo', () => {
  const months = ['2026-11']
  const entries = [
    entry(bill({ id: 'a', category: 'Moradia', expectedAmountCents: 60000 }), '2026-11'),
    entry(bill({ id: 'b', category: 'Lazer', expectedAmountCents: 20000 }), '2026-11'),
  ]
  const slices = categorySlices(entries, months)

  it('a espessura das faixas é proporcional ao valor e fecha com o total de cada lado', () => {
    const model = flowModel(slices, 100000)!
    const layout = layoutFlow(model, { plotH: 200, gap: 0, minH: 0 })
    const thick = (to: string) => layout.links.filter((l) => l.to === to).reduce((acc, l) => acc + l.h, 0)
    expect(thick('cat:Moradia')).toBeCloseTo(120)
    expect(thick('cat:Lazer')).toBeCloseTo(40)
    expect(thick('surplus')).toBeCloseTo(40)
    expect(layout.links.filter((l) => l.from === 'recv').reduce((acc, l) => acc + l.h, 0)).toBeCloseTo(200)
  })

  it('quando falta, a falta e o recebido cobrem cada categoria na mesma proporção', () => {
    const layout = layoutFlow(flowModel(slices, 40000)!, { plotH: 160, gap: 0, minH: 0 })
    const moradia = layout.links.filter((l) => l.to === 'cat:Moradia')
    expect(moradia.map((l) => [l.from, l.cents])).toEqual([
      ['recv', 30000],
      ['gap', 30000],
    ])
  })

  it('os textos de uma coluna nunca ficam mais perto que o espaçamento pedido', () => {
    const many = [
      ...slices,
      { category: 'Pequena', totalCents: 100, share: 0, members: ['Pequena'], slot: 2 },
      { category: 'Mínima', totalCents: 50, share: 0, members: ['Mínima'], slot: 3 },
    ]
    const layout = layoutFlow(flowModel(many, 100000)!, { labelPitch: 30 })
    for (let k = 1; k < layout.targets.length; k++) {
      expect(layout.targets[k].labelY - layout.targets[k - 1].labelY).toBeGreaterThanOrEqual(30)
    }
    expect(layout.height).toBeGreaterThan(0)
  })
})
