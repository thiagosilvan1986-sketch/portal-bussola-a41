import { describe, expect, it } from 'vitest'
import { billAppliesTo, buildEntry, isValidCnpj, missingEntries } from './bills'
import { addMonths, daysInMonth, diffDays, dueDateFor, formatCompetence, formatDateBR, monthsBetween, todayInSaoPaulo } from './dates'
import { displayStatus, isPending, remainingCents, sortEntries, summarize } from './entries'
import { centsToInput, formatBRL, parseBRLToCents } from './money'
import type { Bill, Entry } from './types'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: 'Enel',
  cnpj: '',
  valueType: 'variable',
  expectedAmountCents: 20000,
  dueDay: 15,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  ...over,
})

const entry = (over: Partial<Entry> = {}): Entry => ({
  ...buildEntry(bill(), '2026-11'),
  ...over,
})

describe('money', () => {
  it('formata centavos em reais', () => {
    expect(formatBRL(23840).replace(/ /g, ' ')).toBe('R$ 238,40')
    expect(formatBRL(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56')
  })

  it.each([
    ['238,40', 23840],
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['R$ 238', 23800],
    ['238,4', 23840],
    ['1.234', 123400],
    ['0,05', 5],
    ['0', 0],
  ])('interpreta "%s" como %i centavos', (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents)
  })

  it.each(['', 'abc', '-10', '1,234,56', '12,345', '1.2.3', 'R$'])('rejeita "%s"', (input) => {
    expect(parseBRLToCents(input)).toBeNull()
  })

  it('não perde centavos por ponto flutuante', () => {
    expect(parseBRLToCents('19,90')).toBe(1990)
    expect(parseBRLToCents('1.005,05')).toBe(100505)
    expect(centsToInput(1990)).toBe('19,90')
  })
})

describe('datas', () => {
  it('usa o fuso de São Paulo para "hoje"', () => {
    // 01:30 UTC de 10/11 ainda é 22:30 de 09/11 em São Paulo
    expect(todayInSaoPaulo(new Date('2026-11-10T01:30:00Z'))).toBe('2026-11-09')
    expect(todayInSaoPaulo(new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-10')
  })

  it('soma meses atravessando o ano', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-03', 12)).toBe('2027-03')
  })

  it('calcula diferença de meses e dias', () => {
    expect(monthsBetween('2026-01', '2026-11')).toBe(10)
    expect(monthsBetween('2026-11', '2026-01')).toBe(-10)
    expect(diffDays('2026-11-09', '2026-11-16')).toBe(7)
    expect(diffDays('2026-11-09', '2026-11-08')).toBe(-1)
  })

  it('ajusta vencimento ao último dia do mês', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(dueDateFor('2026-02', 31)).toBe('2026-02-28')
    expect(dueDateFor('2026-04', 31)).toBe('2026-04-30')
    expect(dueDateFor('2026-11', 5)).toBe('2026-11-05')
  })

  it('formata para exibição', () => {
    expect(formatDateBR('2026-11-09')).toBe('09/11/2026')
    expect(formatCompetence('2026-11')).toBe('novembro de 2026')
  })
})

describe('contas recorrentes', () => {
  it('respeita periodicidade e mês de início', () => {
    const tri = bill({ recurrence: 'quarterly', startMonth: '2026-02' })
    expect(billAppliesTo(tri, '2026-01')).toBe(false)
    expect(billAppliesTo(tri, '2026-02')).toBe(true)
    expect(billAppliesTo(tri, '2026-03')).toBe(false)
    expect(billAppliesTo(tri, '2026-05')).toBe(true)
    expect(billAppliesTo(bill({ recurrence: 'yearly', startMonth: '2025-11' }), '2026-11')).toBe(true)
    expect(billAppliesTo(bill({ recurrence: 'yearly', startMonth: '2025-11' }), '2026-12')).toBe(false)
  })

  it('não gera lançamento para conta inativa', () => {
    expect(billAppliesTo(bill({ active: false }), '2026-11')).toBe(false)
  })

  it('gera só os lançamentos que faltam, sem duplicar', () => {
    const bills = [bill(), bill({ id: 'b2', name: 'Internet' })]
    const first = missingEntries(bills, new Set(), ['2026-11', '2026-12'])
    expect(first).toHaveLength(4)
    expect(first.map((e) => e.id)).toContain('b1_2026-11')

    const again = missingEntries(bills, new Set(first.map((e) => e.id)), ['2026-11', '2026-12'])
    expect(again).toHaveLength(0)

    const partial = missingEntries(bills, new Set(['b1_2026-11']), ['2026-11'])
    expect(partial.map((e) => e.id)).toEqual(['b2_2026-11'])
  })

  it('valida CNPJ pelos dígitos verificadores', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false)
    expect(isValidCnpj('00000000000000')).toBe(false)
    expect(isValidCnpj('123')).toBe(false)
  })
})

describe('status e resumo', () => {
  const today = '2026-11-09'

  it('deriva o status pelo vencimento', () => {
    expect(displayStatus(entry({ dueDate: '2026-11-08' }), today)).toBe('atrasada')
    expect(displayStatus(entry({ dueDate: '2026-11-09' }), today)).toBe('vence_em_breve')
    expect(displayStatus(entry({ dueDate: '2026-11-16' }), today)).toBe('vence_em_breve')
    expect(displayStatus(entry({ dueDate: '2026-11-17' }), today)).toBe('prevista')
    expect(displayStatus(entry({ dueDate: '2026-11-30', chargedAmountCents: 21000 }), today)).toBe('cobranca_recebida')
  })

  it('paga e parcial têm prioridade sobre o vencimento', () => {
    const late = { dueDate: '2026-10-01', paidAt: '2026-10-02' }
    expect(displayStatus(entry({ ...late, paidAmountCents: 20000 }), today)).toBe('paga')
    expect(displayStatus(entry({ ...late, paidAmountCents: 5000 }), today)).toBe('parcial')
  })

  it('usa o valor cobrado quando existe', () => {
    const e = entry({ chargedAmountCents: 25000, paidAt: '2026-11-05', paidAmountCents: 20000 })
    expect(remainingCents(e)).toBe(5000)
    expect(displayStatus(e, today)).toBe('parcial')
  })

  it('soma o resumo do mês', () => {
    const entries = [
      entry({ id: 'a', dueDate: '2026-11-05', expectedAmountCents: 10000 }), // atrasada
      entry({ id: 'b', dueDate: '2026-11-12', expectedAmountCents: 20000 }), // em breve
      entry({ id: 'c', dueDate: '2026-11-28', expectedAmountCents: 30000 }), // prevista
      entry({ id: 'd', dueDate: '2026-11-03', expectedAmountCents: 40000, paidAt: '2026-11-03', paidAmountCents: 40000 }),
    ]
    expect(summarize(entries, today)).toEqual({
      totalCents: 100000,
      paidCents: 40000,
      remainingCents: 60000,
      pendingCount: 3,
      overdueCount: 1,
      dueSoonCount: 1,
    })
  })

  it('conta sem pagamento e sem valor ainda é pendente', () => {
    const e = entry({ expectedAmountCents: 0, dueDate: '2026-11-20' })
    expect(isPending(e)).toBe(true)
    expect(summarize([e], today).pendingCount).toBe(1)
    expect(isPending(entry({ paidAt: '2026-11-05', paidAmountCents: 20000 }))).toBe(false)
  })

  it('ordena por vencimento e depois por nome', () => {
    const sorted = sortEntries([
      entry({ id: '1', dueDate: '2026-11-20', billName: 'Zeta' }),
      entry({ id: '2', dueDate: '2026-11-10', billName: 'Beta' }),
      entry({ id: '3', dueDate: '2026-11-10', billName: 'Alfa' }),
    ])
    expect(sorted.map((e) => e.id)).toEqual(['3', '2', '1'])
  })
})
