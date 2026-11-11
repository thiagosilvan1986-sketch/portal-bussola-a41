// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivacyProvider } from '../data/privacy'
import { buildEntry } from '../domain/bills'
import { buildInstallments, withPayment } from '../domain/receivables'
import type { Bill, Entry, Person, Receivable } from '../domain/types'

const TODAY = '2026-11-11'
const flat = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ')

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
const aluguel = bill({ id: 'b2', name: 'Aluguel', category: 'Moradia', expectedAmountCents: 100000, dueDay: 10 })

const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '', email: '', charges: [] }
const tenis: Receivable = {
  id: 'r1',
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 30000,
  installmentCount: 3,
  firstDueDate: '2026-10-10',
  installments: withPayment(buildInstallments(30000, 3, '2026-10-10'), 1, { paidAt: '2026-10-10', paidAmountCents: 10000 }),
  notes: '',
}

// 4º trimestre de 2026 (out, nov, dez): outubro e novembro lançados; dezembro será previsto.
const entries: Entry[] = [
  { ...buildEntry(bill(), '2026-10'), paidAt: '2026-10-05', paidAmountCents: 20000 },
  { ...buildEntry(aluguel, '2026-10'), paidAt: '2026-10-10', paidAmountCents: 100000 },
  buildEntry(bill(), '2026-11'), // venceu dia 5/11: atrasada
  buildEntry(aluguel, '2026-11'), // venceu dia 10/11: atrasada
]

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useEntriesRange: vi.fn(),
  useToday: vi.fn(),
}))
vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)

import Reports from './Reports'

const live = <T,>(data: T[]) => ({ data, ready: true, error: null })

function renderReports() {
  return render(
    <MemoryRouter>
      <PrivacyProvider>
        <Reports />
      </PrivacyProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useBills.mockReturnValue(live([bill(), aluguel]))
  hooks.usePeople.mockReturnValue(live([ana]))
  hooks.useReceivables.mockReturnValue(live([tenis]))
  hooks.useEntriesRange.mockReturnValue(live(entries))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

const kpi = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.kpi')).find((el) => el.firstElementChild?.textContent === name)!

describe('Relatórios', () => {
  it('abre no trimestre atual e consulta os meses certos', () => {
    renderReports()
    expect(screen.getByRole('heading', { level: 2, name: '4º trimestre de 2026' })).toBeTruthy()
    expect(screen.getByText('out a dez')).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-10', '2026-12')
    expect(screen.getByRole('button', { name: 'Trimestre' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('consolida o que paga e o que recebe, com a previsão de dezembro', () => {
    renderReports()
    // A pagar: out 1.200 + nov 1.200 + dez (previsto) 1.200 = 3.600; pago 1.200
    const pay = kpi('A pagar')
    expect(flat(pay.textContent)).toContain('R$ 3.600,00')
    expect(flat(pay.textContent)).toContain('Pago R$ 1.200,00')
    expect(flat(pay.textContent)).toContain('Em aberto R$ 2.400,00')
    // A receber: 3 parcelas de 100 = 300; recebido 100
    const recv = kpi('A receber')
    expect(flat(recv.textContent)).toContain('R$ 300,00')
    expect(flat(recv.textContent)).toContain('Recebido R$ 100,00')
    expect(flat(recv.textContent)).toContain('Em aberto R$ 200,00')
    // Saldo previsto: 300 - 3.600 = falta 3.300; realizado: 100 - 1.200 = menos 1.100
    const balance = kpi('Saldo previsto do período')
    expect(flat(balance.textContent)).toContain('Falta R$ 3.300,00')
    expect(flat(balance.textContent)).toContain('Realizado até agora: menos R$ 1.100,00')
    expect(balance.className).toContain('balance-neg')
  })

  it('avisa o que está em atraso', () => {
    renderReports()
    const alert = screen.getByRole('status')
    // pagar: 200 + 1.000 de novembro; receber: parcelas 2 (10/11) e 3 (10/12 ainda não vence) -> 100 + 0
    expect(flat(alert.textContent)).toContain('a pagar R$ 1.200,00')
    expect(flat(alert.textContent)).toContain('a receber R$ 100,00')
  })

  it('o detalhamento traz mês a mês, marca o mês previsto e soma o total', () => {
    renderReports()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').map((r) => flat(r.textContent))
    expect(rows[1]).toContain('out')
    expect(rows[1]).toContain('R$ 1.200,00')
    expect(rows[3]).toContain('dez*')
    expect(rows[4]).toContain('Total')
    expect(rows[4]).toContain('R$ 3.600,00')
    expect(screen.getByText(/Mês sem lançamento ainda/)).toBeTruthy()
  })

  it('tocar em um mês do gráfico mostra os valores dele; tocar de novo desfaz', () => {
    renderReports()
    expect(screen.getByText('Toque em um mês do gráfico para ver os valores.')).toBeTruthy()
    const nov = screen.getByRole('button', { name: /^nov: a pagar/ })
    fireEvent.click(nov)
    const readout = flat(document.querySelector('.chart-readout')!.textContent)
    expect(readout).toContain('novembro de 2026')
    expect(readout).toContain('a pagar R$ 1.200,00 (pago R$ 0,00)')
    expect(readout).toContain('a receber R$ 100,00')
    fireEvent.click(screen.getByRole('button', { name: /^nov: a pagar/ }))
    expect(screen.getByText('Toque em um mês do gráfico para ver os valores.')).toBeTruthy()
  })

  it('o gráfico também funciona pelo teclado', () => {
    renderReports()
    fireEvent.keyDown(screen.getByRole('button', { name: /^out: a pagar/ }), { key: 'Enter' })
    expect(flat(document.querySelector('.chart-readout')!.textContent)).toContain('outubro de 2026')
  })

  it('troca para semestre e ano e volta ao período atual', () => {
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Semestre' }))
    expect(screen.getByRole('heading', { level: 2, name: '2º semestre de 2026' })).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-07', '2026-12')
    fireEvent.click(screen.getByRole('button', { name: 'Ano' }))
    expect(screen.getByRole('heading', { level: 2, name: '2026' })).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-01', '2026-12')
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(14) // cabeçalho + 12 meses + total

    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }))
    expect(screen.getByRole('heading', { level: 2, name: '2025' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao período atual' }))
    expect(screen.getByRole('heading', { level: 2, name: '2026' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Voltar ao período atual' })).toBeNull()
  })

  it('navega entre trimestres, atravessando o ano', () => {
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo período' }))
    expect(screen.getByRole('heading', { level: 2, name: '1º trimestre de 2027' })).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2027-01', '2027-03')
  })

  it('mostra para onde vai o dinheiro e quem mais deve', () => {
    renderReports()
    const cats = screen.getByRole('region', { name: 'Contas a pagar por categoria' })
    const items = within(cats).getAllByRole('listitem').map((li) => flat(li.textContent))
    expect(items[0]).toContain('Moradia')
    expect(items[0]).toContain('R$ 3.000,00')
    expect(items[0]).toContain('83%')
    expect(items[1]).toContain('Contas de consumo')
    const debtors = screen.getByRole('region', { name: 'Quem mais deve' })
    expect(within(debtors).getByRole('link').getAttribute('href')).toBe('/receber/pessoa/p1')
    expect(flat(debtors.textContent)).toContain('Ana Souza')
    expect(flat(debtors.textContent)).toContain('R$ 200,00')
    expect(flat(debtors.textContent)).toContain('R$ 100,00 em atraso')
  })

  it('com o olhinho fechado, nenhum valor aparece (nem na tabela nem no gráfico)', () => {
    localStorage.setItem('contas-em-dia:ocultar-valores', '1')
    renderReports()
    expect(document.body.textContent).not.toMatch(/\d\.\d{3},\d{2}|\d+,\d{2}/)
    expect(flat(kpi('A pagar').textContent)).toContain('R$ ••••')
    expect(screen.getByRole('button', { name: /^nov: a pagar R\$ ••••/ })).toBeTruthy()
  })

  it('período sem nada mostra um aviso em vez de gráficos vazios', () => {
    hooks.useEntriesRange.mockReturnValue(live([]))
    hooks.useBills.mockReturnValue(live([]))
    hooks.useReceivables.mockReturnValue(live([]))
    renderReports()
    expect(screen.getByText('Nada neste período')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('meses passados não são inventados: só entra o que foi lançado', () => {
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' })) // 3º trimestre
    expect(screen.queryByText(/Mês sem lançamento ainda/)).toBeNull()
  })

  it('mostra carregando enquanto os dados não chegam', () => {
    hooks.useEntriesRange.mockReturnValue({ data: [], ready: false, error: null })
    renderReports()
    expect(screen.getByText('Carregando…')).toBeTruthy()
  })
})
