import { describe, expect, it } from 'vitest'
import { buildEntry } from './bills'
import { linkOfEntry, netOfReimbursements, receivablesOfBill } from './linked'
import { monthlyReport } from './reports'
import { buildInstallments, withPayment } from './receivables'
import type { Bill, Entry, Person, Receivable } from './types'

const TODAY = '2026-11-11'

const cartao: Bill = {
  id: 'b1',
  name: 'Cartão Nubank',
  category: 'Cartão de crédito',
  supplier: '',
  valueType: 'variable',
  expectedAmountCents: 100000,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'cartao',
  notes: '',
  active: true,
}
const outra: Bill = { ...cartao, id: 'b2', name: 'Energia', expectedAmountCents: 20000 }

const ana: Person = { id: 'p1', name: 'Ana', phone: '', email: '', charges: [] }

const reembolso = (over: Partial<Receivable> = {}): Receivable => ({
  id: 'r1',
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 50000,
  installmentCount: 1,
  firstDueDate: '2026-11-10',
  installments: buildInstallments(50000, 1, '2026-11-10'),
  notes: '',
  billId: 'b1',
  ...over,
})

const entry = (b: Bill, competence: string, over: Partial<Entry> = {}): Entry => ({ ...buildEntry(b, competence), ...over })

describe('conta a receber ligada à conta a pagar', () => {
  it('desconta do valor pago o que a pessoa devolve no mesmo mês: pago 1.000, a receber 500, gasto real 500', () => {
    const e = entry(cartao, '2026-11', { paidAt: '2026-11-10', paidAmountCents: 100000 })
    const link = linkOfEntry(e, [reembolso()], [ana])!
    expect(link).toMatchObject({ grossCents: 100000, receivableCents: 50000, realCents: 50000, openCents: 50000, receivedCents: 0 })
    expect(link.people).toEqual([{ personId: 'p1', name: 'Ana', cents: 50000 }])
  })

  it('conta ainda não paga usa o valor a pagar; o que já foi recebido sai do "ainda não recebido"', () => {
    const recebido = reembolso({ installments: withPayment(buildInstallments(50000, 1, '2026-11-10'), 1, { paidAt: '2026-11-12', paidAmountCents: 20000 }) })
    const link = linkOfEntry(entry(cartao, '2026-11', { chargedAmountCents: 120000 }), [recebido])!
    expect(link).toMatchObject({ grossCents: 120000, realCents: 70000, receivedCents: 20000, openCents: 30000 })
  })

  it('só conta a parcela que vence no mês da conta, e só da conta ligada', () => {
    const parcelado = reembolso({ totalCents: 30000, installmentCount: 3, firstDueDate: '2026-11-10', installments: buildInstallments(30000, 3, '2026-11-10') })
    expect(linkOfEntry(entry(cartao, '2026-12'), [parcelado])!.receivableCents).toBe(10000)
    expect(linkOfEntry(entry(cartao, '2027-03'), [parcelado])).toBeNull()
    expect(linkOfEntry(entry(outra, '2026-11'), [parcelado])).toBeNull()
    expect(linkOfEntry(entry(cartao, '2026-11'), [reembolso({ billId: null })])).toBeNull()
  })

  it('o gasto real nunca fica negativo', () => {
    expect(linkOfEntry(entry(cartao, '2026-11', { chargedAmountCents: 30000 }), [reembolso()])!.realCents).toBe(0)
  })

  it('acha as compras ligadas a uma conta', () => {
    expect(receivablesOfBill('b1', [reembolso(), reembolso({ id: 'r2', billId: 'b2' }), reembolso({ id: 'r3', billId: undefined })]).map((r) => r.id)).toEqual(['r1'])
  })
})

describe('visão real dos relatórios', () => {
  it('desconta das contas e tira do "a receber" o que foi descontado, sem contar duas vezes', () => {
    const entries = [entry(cartao, '2026-11', { paidAt: '2026-11-10', paidAmountCents: 100000 }), entry(outra, '2026-11')]
    const gross = monthlyReport(['2026-11'], entries, [reembolso()], TODAY)[0]
    expect(gross).toMatchObject({ payTotalCents: 120000, recvTotalCents: 50000 })

    const net = netOfReimbursements(entries, [reembolso()])
    expect(net).toMatchObject({ reimbursedCents: 50000, notReceivedCents: 50000 })
    const real = monthlyReport(['2026-11'], net.entries, net.receivables, TODAY)[0]
    expect(real).toMatchObject({ payTotalCents: 70000, payPaidCents: 50000, recvTotalCents: 0 })
    // a conta de energia não tem ligação e fica como estava
    expect(net.entries[1]).toEqual(entries[1])
  })

  it('parcela de um mês sem a conta continua no "a receber"', () => {
    const parcelado = reembolso({ totalCents: 20000, installmentCount: 2, firstDueDate: '2026-11-10', installments: buildInstallments(20000, 2, '2026-11-10') })
    const net = netOfReimbursements([entry(cartao, '2026-11')], [parcelado])
    expect(net.receivables[0].installments.map((i) => i.number)).toEqual([2]) // a de dezembro não tem conta em dezembro nesta lista
    expect(net.reimbursedCents).toBe(10000)
  })

  it('sem nenhuma ligação, devolve tudo como veio', () => {
    const entries = [entry(cartao, '2026-11')]
    const list = [reembolso({ billId: null })]
    const net = netOfReimbursements(entries, list)
    expect(net.entries).toBe(entries)
    expect(net.receivables).toBe(list)
    expect(net).toMatchObject({ reimbursedCents: 0, notReceivedCents: 0 })
  })
})
