import { describe, expect, it } from 'vitest'
import { buildEntry } from './bills'
import { amountDue, isPending, remainingCents, sortEntries } from './entries'
import {
  BILL_SORT_DEFAULT,
  CONTACT_SORT_DEFAULT,
  DEBTOR_SORT_DEFAULT,
  ENTRY_SORT_DEFAULT,
  MONTH_SORT_DEFAULT,
  NAME_SORT_DEFAULT,
  PERSON_SORT_DEFAULT,
  PURCHASE_SORT_DEFAULT,
  SLICE_SORT_DEFAULT,
  TEMPLATE_SORT_DEFAULT,
  comparePeopleBySituation,
  monthSorts,
  sortBillsBy,
  sortDebtorsBy,
  sortEntriesBy,
  sortMonthsBy,
  sortNamesBy,
  sortPeopleBy,
  sortPurchasesBy,
  sortSlicesBy,
  sortTemplatesBy,
  type PersonRow,
} from './listSorts'
import { OTHER_CATEGORIES } from './reports'
import { buildInstallments, summarizePerson, withPayment } from './receivables'
import type { Bill, Person, Receivable } from './types'

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

describe('Início e contas da categoria (lançamentos)', () => {
  const entries = [
    buildEntry(bill({ id: 'a', name: 'Internet', dueDay: 28, expectedAmountCents: 12990 }), '2026-11'),
    buildEntry(bill({ id: 'b', name: 'Energia', dueDay: 5, expectedAmountCents: 20000 }), '2026-11'),
    { ...buildEntry(bill({ id: 'c', name: 'Condomínio', dueDay: 3, expectedAmountCents: 50000 }), '2026-11'), paidAt: '2026-11-03', paidAmountCents: 50000 },
    buildEntry(bill({ id: 'd', name: 'Água', dueDay: 5, expectedAmountCents: 9000 }), '2026-11'),
  ]
  const base = sortEntries(entries)
  const names = (list: typeof entries) => list.map((e) => e.billName)

  it('por vencimento: e, no empate, nome', () => {
    expect(names(sortEntriesBy(base, { key: 'vencimento', dir: 'asc' }))).toEqual(names(base))
    expect(names(base)).toEqual(['Condomínio', 'Água', 'Energia', 'Internet'])
  })

  it('por vencimento decrescente, o empate continua em ordem de nome', () => {
    expect(names(sortEntriesBy(base, { key: 'vencimento', dir: 'desc' }))).toEqual(['Internet', 'Água', 'Energia', 'Condomínio'])
  })

  it('por nome, nos dois sentidos', () => {
    expect(names(sortEntriesBy(base, { key: 'nome', dir: 'asc' }))).toEqual(['Água', 'Condomínio', 'Energia', 'Internet'])
    expect(names(sortEntriesBy(base, { key: 'nome', dir: 'desc' }))).toEqual(['Internet', 'Energia', 'Condomínio', 'Água'])
  })

  it('por valor, do maior para o menor e o contrário', () => {
    expect(names(sortEntriesBy(base, { key: 'valor', dir: 'desc' }))).toEqual(['Condomínio', 'Energia', 'Internet', 'Água'])
    expect(names(sortEntriesBy(base, { key: 'valor', dir: 'asc' }))).toEqual(['Água', 'Internet', 'Energia', 'Condomínio'])
  })

  it('o valor segue o que a tela mostra: o que falta, se pendente; senão o valor da conta', () => {
    // Energia: pagou R$ 190 de R$ 200, faltam R$ 10: é o menor valor na tela, embora a conta seja de R$ 200.
    const partial = entries.map((e) => (e.billName === 'Energia' ? { ...e, paidAt: '2026-11-04', paidAmountCents: 19000 } : e))
    const shown = (e: (typeof entries)[number]) => (isPending(e) ? remainingCents(e) : amountDue(e))
    expect(shown(partial[1])).toBe(1000)
    expect(names(sortEntriesBy(sortEntries(partial), { key: 'valor', dir: 'asc' }, shown))[0]).toBe('Energia')
    // Pelo valor da conta (sem o ajuste), Energia não seria a menor.
    expect(names(sortEntriesBy(sortEntries(partial), { key: 'valor', dir: 'asc' }))[0]).toBe('Água')
  })
})

describe('A pagar (contas cadastradas)', () => {
  const bills = [
    bill({ id: '1', name: 'Seguro', expectedAmountCents: 30000, dueDay: 20 }),
    bill({ id: '2', name: 'Academia', expectedAmountCents: 15000, dueDay: 1 }),
    bill({ id: '3', name: 'Antiga', expectedAmountCents: 99900, dueDay: 2, active: false }),
    bill({ id: '4', name: 'Internet', expectedAmountCents: 12990, dueDay: 28 }),
  ]
  const names = (list: Bill[]) => list.map((b) => b.name)

  it('o padrão é a ordem de sempre: ativas primeiro, por nome', () => {
    expect(names(sortBillsBy(bills, BILL_SORT_DEFAULT))).toEqual(['Academia', 'Internet', 'Seguro', 'Antiga'])
  })

  it('por valor e por dia, e as arquivadas ficam sempre no fim', () => {
    expect(names(sortBillsBy(bills, { key: 'valor', dir: 'desc' }))).toEqual(['Seguro', 'Academia', 'Internet', 'Antiga'])
    expect(names(sortBillsBy(bills, { key: 'valor', dir: 'asc' }))).toEqual(['Internet', 'Academia', 'Seguro', 'Antiga'])
    expect(names(sortBillsBy(bills, { key: 'vencimento', dir: 'asc' }))).toEqual(['Academia', 'Seguro', 'Internet', 'Antiga'])
    expect(names(sortBillsBy(bills, { key: 'vencimento', dir: 'desc' }))).toEqual(['Internet', 'Seguro', 'Academia', 'Antiga'])
    expect(names(sortBillsBy(bills, { key: 'nome', dir: 'desc' }))).toEqual(['Seguro', 'Internet', 'Academia', 'Antiga'])
  })
})

describe('A receber (pessoas)', () => {
  const person = (id: string, name: string): Person => ({ id, name, phone: '', email: '', charges: [] })
  const purchase = (personId: string, total: number, first: string, paidFirst = false): Receivable => ({
    id: `r-${personId}`,
    personId,
    kind: 'cartao',
    description: 'Compra',
    totalCents: total,
    installmentCount: 2,
    firstDueDate: first,
    installments: paidFirst
      ? withPayment(buildInstallments(total, 2, first), 1, { paidAt: first, paidAmountCents: total / 2 })
      : buildInstallments(total, 2, first),
    notes: '',
  })
  const row = (p: Person, rs: Receivable[]): PersonRow => ({ person: p, summary: summarizePerson(rs, TODAY) })

  const rows: PersonRow[] = [
    row(person('1', 'Carla'), [purchase('1', 20000, '2026-12-05')]), // deve 200, próxima 05/12
    row(person('2', 'Ana'), [purchase('2', 60000, '2026-10-05')]), // atrasada, deve 600
    row(person('3', 'Bruno'), [purchase('3', 10000, '2026-11-20')]), // deve 100, próxima 20/11
    row(person('4', 'Davi'), []), // sem compras
    row(person('5', 'Eva'), [purchase('5', 10000, '2026-09-20', true)]), // 2ª parcela (20/10) atrasada
  ]
  const names = (list: PersonRow[]) => list.map((r) => r.person.name)

  it('pela situação: atrasados, quem ainda deve, maior saldo, nome', () => {
    const old = [...rows].sort(comparePeopleBySituation)
    expect(names(sortPeopleBy(rows, { key: 'situacao', dir: 'asc' }))).toEqual(names(old))
    expect(names(sortPeopleBy(rows, { key: 'situacao', dir: 'asc' }))).toEqual(['Ana', 'Eva', 'Carla', 'Bruno', 'Davi'])
  })

  it('por nome, nos dois sentidos', () => {
    expect(names(sortPeopleBy(rows, { key: 'nome', dir: 'asc' }))).toEqual(['Ana', 'Bruno', 'Carla', 'Davi', 'Eva'])
    expect(names(sortPeopleBy(rows, { key: 'nome', dir: 'desc' }))).toEqual(['Eva', 'Davi', 'Carla', 'Bruno', 'Ana'])
  })

  it('por valor a receber', () => {
    expect(names(sortPeopleBy(rows, { key: 'valor', dir: 'desc' }))).toEqual(['Ana', 'Carla', 'Bruno', 'Eva', 'Davi'])
    expect(names(sortPeopleBy(rows, { key: 'valor', dir: 'asc' }))[0]).toBe('Davi')
  })

  it('por próximo vencimento: quem não tem parcela a vencer fica sempre no fim', () => {
    // Davi não tem parcela. Ana (05/10) e Eva (20/10) têm parcelas atrasadas, as mais antigas.
    const asc = names(sortPeopleBy(rows, { key: 'vencimento', dir: 'asc' }))
    expect(asc).toEqual(['Ana', 'Eva', 'Bruno', 'Carla', 'Davi'])
    const desc = names(sortPeopleBy(rows, { key: 'vencimento', dir: 'desc' }))
    expect(desc).toEqual(['Carla', 'Bruno', 'Eva', 'Ana', 'Davi'])
  })
})

describe('Pessoa (compras)', () => {
  const r = (id: string, description: string, total: number, first: string, paidAll = false): Receivable => {
    let installments = buildInstallments(total, 2, first)
    if (paidAll) {
      installments = withPayment(installments, 1, { paidAt: first, paidAmountCents: installments[0].amountCents })
      installments = withPayment(installments, 2, { paidAt: first, paidAmountCents: installments[1].amountCents })
    }
    return { id, personId: 'p', kind: 'cartao', description, totalCents: total, installmentCount: 2, firstDueDate: first, installments, notes: '' }
  }
  const list = [
    r('1', 'Tênis', 30000, '2026-12-10'),
    r('2', 'Geladeira', 90000, '2026-11-15'),
    r('3', 'Bicicleta', 50000, '2026-08-01', true), // quitada
    r('4', 'Celular', 40000, '2027-01-05'),
  ]
  const names = (rs: Receivable[]) => rs.map((x) => x.description)

  it('pela situação: com saldo primeiro, pela próxima parcela', () => {
    expect(names(sortPurchasesBy(list, { key: 'situacao', dir: 'asc' }, TODAY))).toEqual(['Geladeira', 'Tênis', 'Celular', 'Bicicleta'])
  })

  it('por nome, valor e próxima parcela', () => {
    expect(names(sortPurchasesBy(list, { key: 'nome', dir: 'asc' }, TODAY))).toEqual(['Bicicleta', 'Celular', 'Geladeira', 'Tênis'])
    expect(names(sortPurchasesBy(list, { key: 'valor', dir: 'desc' }, TODAY))).toEqual(['Geladeira', 'Bicicleta', 'Celular', 'Tênis'])
    // A compra quitada não tem próxima parcela: fica no fim, nos dois sentidos.
    expect(names(sortPurchasesBy(list, { key: 'vencimento', dir: 'asc' }, TODAY))).toEqual(['Geladeira', 'Tênis', 'Celular', 'Bicicleta'])
    expect(names(sortPurchasesBy(list, { key: 'vencimento', dir: 'desc' }, TODAY))).toEqual(['Celular', 'Tênis', 'Geladeira', 'Bicicleta'])
  })
})

describe('Relatórios', () => {
  it('Quem mais deve: padrão por valor em aberto, e por nome', () => {
    const debtors = [
      { name: 'Carla', openCents: 10000 },
      { name: 'Ana', openCents: 50000 },
      { name: 'Bruno', openCents: 50000 },
    ]
    expect(sortDebtorsBy(debtors, DEBTOR_SORT_DEFAULT).map((d) => d.name)).toEqual(['Ana', 'Bruno', 'Carla'])
    expect(sortDebtorsBy(debtors, { key: 'valor', dir: 'asc' }).map((d) => d.name)).toEqual(['Carla', 'Ana', 'Bruno'])
    expect(sortDebtorsBy(debtors, { key: 'nome', dir: 'desc' }).map((d) => d.name)).toEqual(['Carla', 'Bruno', 'Ana'])
  })

  it('Categorias: "Outras categorias" fica no fim em qualquer critério e sentido', () => {
    const slices = [
      { category: 'Moradia', totalCents: 100000 },
      { category: 'Saúde', totalCents: 30000 },
      { category: 'Lazer', totalCents: 50000 },
      { category: OTHER_CATEGORIES, totalCents: 70000 },
    ]
    const names = (c: Parameters<typeof sortSlicesBy>[1]) => sortSlicesBy(slices, c).map((s) => s.category)
    expect(names({ key: 'valor', dir: 'desc' })).toEqual(['Moradia', 'Lazer', 'Saúde', OTHER_CATEGORIES])
    expect(names({ key: 'valor', dir: 'asc' })).toEqual(['Saúde', 'Lazer', 'Moradia', OTHER_CATEGORIES])
    expect(names({ key: 'nome', dir: 'asc' })).toEqual(['Lazer', 'Moradia', 'Saúde', OTHER_CATEGORIES])
    expect(names({ key: 'nome', dir: 'desc' })).toEqual(['Saúde', 'Moradia', 'Lazer', OTHER_CATEGORIES])
  })

  it('Detalhamento: os critérios seguem as colunas da tabela', () => {
    const keys = (shape: Parameters<typeof monthSorts>[0]) => monthSorts(shape).map((o) => o.key)
    expect(keys({ showPay: true, showRecv: true, showBalance: true, payLabel: 'A pagar' })).toEqual(['mes', 'pagar', 'receber', 'saldo'])
    expect(keys({ showPay: true, showRecv: false, showBalance: false, payLabel: 'A pagar' })).toEqual(['mes', 'pagar'])
    expect(keys({ showPay: false, showRecv: true, showBalance: false, payLabel: 'A pagar' })).toEqual(['mes', 'receber'])
    expect(monthSorts({ showPay: true, showRecv: false, showBalance: false, payLabel: 'Gasto real' })[1].label).toBe('Gasto real')
  })

  it('Detalhamento: por mês (padrão), valor a pagar, a receber e saldo', () => {
    const months = [
      { competence: '2026-10', payTotalCents: 300, recvTotalCents: 100 },
      { competence: '2026-11', payTotalCents: 100, recvTotalCents: 500 },
      { competence: '2026-12', payTotalCents: 200, recvTotalCents: 150 },
    ]
    const order = (c: Parameters<typeof sortMonthsBy>[1]) => sortMonthsBy(months, c).map((m) => m.competence)
    expect(order(MONTH_SORT_DEFAULT)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(order({ key: 'mes', dir: 'desc' })).toEqual(['2026-12', '2026-11', '2026-10'])
    expect(order({ key: 'pagar', dir: 'desc' })).toEqual(['2026-10', '2026-12', '2026-11'])
    expect(order({ key: 'receber', dir: 'desc' })).toEqual(['2026-11', '2026-12', '2026-10'])
    expect(order({ key: 'saldo', dir: 'desc' })).toEqual(['2026-11', '2026-12', '2026-10'])
    expect(order({ key: 'saldo', dir: 'asc' })).toEqual(['2026-10', '2026-12', '2026-11'])
  })
})

describe('Cadastros', () => {
  it('categorias, pagamentos e fornecedores: ordem de cadastro ou por nome (padrão)', () => {
    const items = [{ label: 'Viagens' }, { label: 'Água' }, { label: 'Moradia' }]
    expect(sortNamesBy(items, { key: 'ordem', dir: 'asc' }).map((i) => i.label)).toEqual(['Viagens', 'Água', 'Moradia'])
    expect(sortNamesBy(items, { key: 'nome', dir: 'asc' }).map((i) => i.label)).toEqual(['Água', 'Moradia', 'Viagens'])
    expect(sortNamesBy(items, { key: 'nome', dir: 'desc' }).map((i) => i.label)).toEqual(['Viagens', 'Moradia', 'Água'])
  })

  it('atalhos: por nome, valor e dia; sem valor ou sem dia ficam no fim', () => {
    const templates = [
      { name: 'Seguro', amountCents: 30000, dueDay: 20 },
      { name: 'Academia', amountCents: 0, dueDay: null },
      { name: 'Internet', amountCents: 12990, dueDay: 5 },
      { name: 'Condomínio', amountCents: 50000, dueDay: null },
    ]
    const names = (c: Parameters<typeof sortTemplatesBy>[1]) => sortTemplatesBy(templates, c).map((t) => t.name)
    expect(names({ key: 'ordem', dir: 'asc' })).toEqual(['Seguro', 'Academia', 'Internet', 'Condomínio'])
    expect(names({ key: 'nome', dir: 'asc' })).toEqual(['Academia', 'Condomínio', 'Internet', 'Seguro'])
    expect(names({ key: 'valor', dir: 'desc' })).toEqual(['Condomínio', 'Seguro', 'Internet', 'Academia'])
    expect(names({ key: 'valor', dir: 'asc' })).toEqual(['Internet', 'Seguro', 'Condomínio', 'Academia'])
    expect(names({ key: 'dia', dir: 'asc' })).toEqual(['Internet', 'Seguro', 'Academia', 'Condomínio'])
    expect(names({ key: 'dia', dir: 'desc' })).toEqual(['Seguro', 'Internet', 'Academia', 'Condomínio'])
  })
})

describe('ordem padrão de todas as listas', () => {
  it('é sempre o nome, de A a Z (pedido: todas as listas em ordem alfabética)', () => {
    for (const d of [ENTRY_SORT_DEFAULT, BILL_SORT_DEFAULT, PERSON_SORT_DEFAULT, PURCHASE_SORT_DEFAULT, DEBTOR_SORT_DEFAULT, SLICE_SORT_DEFAULT, NAME_SORT_DEFAULT, TEMPLATE_SORT_DEFAULT, CONTACT_SORT_DEFAULT]) {
      expect(d).toEqual({ key: 'nome', dir: 'asc' })
    }
  })
})
