import { describe, expect, it } from 'vitest'
import { netOfReimbursements } from './linked'
import { buildEntry } from './bills'
import { buildRateio, chargeMessage, editReceivable, extendRecurring, isCardBill, isOpenEnded, parcelLabel } from './receivables'
import type { Bill, Person, Receivable } from './types'

const carol: Person = { id: 'p1', name: 'Carol Lima', phone: '', email: '', charges: [] }
const aluguel: Bill = {
  id: 'b1', name: 'Aluguel', category: 'Moradia', supplier: '', valueType: 'fixed', expectedAmountCents: 190800, dueDay: 10,
  recurrence: 'monthly', startMonth: '2026-01', paymentMethod: 'pix', notes: '', active: true, skippedMonths: [],
}

/** Rateio sem fim de R$ 954,00 desde setembro, dia 10; gravado só até outubro. */
const semFim = (over: Partial<Receivable> = {}): Receivable => {
  const installments = buildRateio(95400, '2026-09', 10, { count: 2 })
  return {
    id: 'r1', personId: 'p1', kind: 'rateio', description: 'Parte da Carol no aluguel', totalCents: 190800, installmentCount: 2,
    firstDueDate: '2026-09-10', installments, notes: '', billId: 'b1', recurring: true, monthlyCents: 95400, endMonth: null, ...over,
  }
}

describe('rateio de conta', () => {
  it('com parcelas, gera o número pedido de meses no dia da conta', () => {
    const list = buildRateio(47700, '2026-11', 31, { count: 3 })
    expect(list.map((i) => [i.number, i.dueDate, i.amountCents])).toEqual([
      [1, '2026-11-30', 47700],
      [2, '2026-12-31', 47700],
      [3, '2027-01-31', 47700],
    ])
  })

  it('sem fim, completa os meses até o horizonte e mantém as baixas', () => {
    const r = semFim()
    r.installments[0] = { ...r.installments[0], paidAt: '2026-09-10', paidAmountCents: 95400 }
    const full = extendRecurring(r, '2026-12')
    expect(full.installments.map((i) => i.dueDate)).toEqual(['2026-09-10', '2026-10-10', '2026-11-10', '2026-12-10'])
    expect(full.installments[0].paidAt).toBe('2026-09-10')
    expect(full.installmentCount).toBe(4)
    expect(full.totalCents).toBe(4 * 95400)
    expect(isOpenEnded(full)).toBe(true)
  })

  it('encerrado, para no último mês e não cobra os seguintes', () => {
    const full = extendRecurring(semFim({ endMonth: '2026-10' }), '2027-03')
    expect(full.installments.map((i) => i.dueDate)).toEqual(['2026-09-10', '2026-10-10'])
  })

  it('o que não é rateio sem fim volta igual', () => {
    const r = semFim({ recurring: false })
    expect(extendRecurring(r, '2027-12')).toBe(r)
  })

  it('editar o valor do rateio sem fim refaz os meses e mantém os recebidos', () => {
    const r = extendRecurring(semFim(), '2026-12')
    r.installments[0] = { ...r.installments[0], paidAt: '2026-09-10', paidAmountCents: 95400 }
    const edited = editReceivable(r, {
      kind: 'rateio', description: 'Parte da Carol', totalCents: r.totalCents, installmentCount: r.installmentCount,
      firstDueDate: '2026-09-10', notes: '', billId: 'b1', monthlyCents: 100000, recurring: true, endMonth: null,
    })
    expect(edited.installments.map((i) => i.amountCents)).toEqual([100000, 100000, 100000, 100000])
    expect(edited.installments[0]).toMatchObject({ paidAt: '2026-09-10', paidAmountCents: 95400 })
    expect(edited.monthlyCents).toBe(100000)
  })

  it('passar para parcelado vira valor × parcelas e tira o "sem fim"', () => {
    const edited = editReceivable(semFim(), {
      kind: 'rateio', description: 'x', totalCents: 0, installmentCount: 6, firstDueDate: '2026-09-10', notes: '', billId: 'b1',
      monthlyCents: 50000, recurring: false, endMonth: null,
    })
    expect(edited).toMatchObject({ recurring: false, installmentCount: 6, totalCents: 300000 })
    expect(edited.installments).toHaveLength(6)
  })

  it('rótulo e mensagem de cobrança falam do mês, não de "parcela X de Y"', () => {
    const r = extendRecurring(semFim(), '2026-11')
    expect(parcelLabel(r, r.installments[2])).toBe('Parte de nov/2026')
    const msg = chargeMessage(carol, [r], '2026-11-13')!
    expect(msg.kind).toBe('overdue')
    expect(msg.subject).toBe('Partes em atraso: Parte da Carol no aluguel')
    expect(msg.text).toContain('das partes de set/2026, out/2026 e nov/2026 do rateio (Parte da Carol no aluguel)')
    expect(msg.text).not.toContain(' de 3 ')
  })

  it('entra no gasto real da conta ligada, como o reembolso do cartão', () => {
    const r = extendRecurring(semFim(), '2026-11')
    const entry = buildEntry(aluguel, '2026-11')
    const net = netOfReimbursements([entry], [r])
    expect(net.entries[0].expectedAmountCents).toBe(190800 - 95400)
  })
})

describe('contas que podem ser ligadas ao reembolso do cartão', () => {
  const payments = [
    { id: 'boleto', label: 'Boleto' },
    { id: 'cartao', label: 'Cartão' },
    { id: 'nubank', label: 'Nubank crédito' },
    { id: 'deb', label: 'Cartão de débito' },
  ]
  it('só as pagas com cartão de crédito', () => {
    expect(isCardBill({ paymentMethod: 'cartao' }, payments)).toBe(true)
    expect(isCardBill({ paymentMethod: 'nubank' }, payments)).toBe(true)
    expect(isCardBill({ paymentMethod: 'boleto' }, payments)).toBe(false)
    expect(isCardBill({ paymentMethod: 'deb' }, payments)).toBe(false)
  })
})
