// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEntry } from '../domain/bills'
import type { Bill, Entry } from '../domain/types'

const TODAY = '2026-11-09'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: '',
  cnpj: '',
  valueType: 'variable',
  expectedAmountCents: 20000,
  dueDay: 5,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  ...over,
})

const entries: Entry[] = [
  { ...buildEntry(bill({ id: 'b3', name: 'Internet', dueDay: 28, expectedAmountCents: 12990 }), '2026-11') },
  { ...buildEntry(bill(), '2026-11') }, // vence dia 5: atrasada
  {
    ...buildEntry(bill({ id: 'b2', name: 'Condomínio', dueDay: 3, expectedAmountCents: 50000 }), '2026-11'),
    paidAt: '2026-11-03',
    paidAmountCents: 50000,
  },
]

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  useEntries: vi.fn(),
  useToday: vi.fn(),
  useSuggestions: vi.fn(),
}))
const store = vi.hoisted(() => ({
  ensureEntries: vi.fn(),
  payEntry: vi.fn(),
  saveBill: vi.fn(),
  undoPayment: vi.fn(),
  updateEntryDetails: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import BillForm from './BillForm'
import Home from './Home'

beforeEach(() => {
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useSuggestions.mockReturnValue({ data: [], ready: true, error: null })
  hooks.useBills.mockReturnValue({ data: [bill()], ready: true, error: null })
  hooks.useEntries.mockReturnValue({ data: entries, ready: true, error: null })
  store.ensureEntries.mockResolvedValue(0)
  store.payEntry.mockResolvedValue(undefined)
  store.saveBill.mockResolvedValue('new-id')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const text = (el: Element | null) => (el?.textContent ?? '').replace(/ /g, ' ')

describe('Início', () => {
  const renderHome = () =>
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

  it('mostra o resumo do mês e o aviso de atrasada', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('novembro de 2026')

    const summary = screen.getByLabelText('Resumo do mês')
    const t = text(summary)
    // pendentes: Energia 200,00 (atrasada) + Internet 129,90 = 329,90; pago 500,00; total 829,90
    expect(t).toContain('R$ 329,90')
    expect(t).toContain('R$ 500,00')
    expect(t).toContain('R$ 829,90')
    expect(t).toContain('2 contas pendentes')

    expect(screen.getByRole('status').textContent).toContain('1 conta atrasada')
  })

  it('lista por vencimento e mostra o status em texto', () => {
    renderHome()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.row-title')?.textContent)).toEqual(['Condomínio', 'Energia', 'Internet'])
    expect(within(rows[0]).getByText('Paga')).toBeTruthy()
    expect(within(rows[1]).getByText('Atrasada')).toBeTruthy()
    expect(within(rows[2]).getByText('Prevista')).toBeTruthy()
  })

  it('o botão de check paga o valor a pagar com a data de hoje', () => {
    renderHome()
    fireEvent.click(screen.getByLabelText('Marcar Energia como paga'))
    expect(store.payEntry).toHaveBeenCalledWith('u1', 'b1_2026-11', 20000, TODAY)
    // conta já paga não tem botão
    expect(screen.queryByLabelText('Marcar Condomínio como paga')).toBeNull()
  })

  it('gera os lançamentos do mês atual e do próximo', async () => {
    renderHome()
    await waitFor(() => expect(store.ensureEntries).toHaveBeenCalled())
    const [uid, , competences] = store.ensureEntries.mock.calls[0]
    expect(uid).toBe('u1')
    expect([...competences].sort()).toEqual(['2026-11', '2026-12'])
  })

  it('sem contas cadastradas, convida a cadastrar a primeira', () => {
    hooks.useBills.mockReturnValue({ data: [], ready: true, error: null })
    hooks.useEntries.mockReturnValue({ data: [], ready: true, error: null })
    renderHome()
    expect(screen.getByText('Cadastre sua primeira conta')).toBeTruthy()
  })

  it('navega entre os meses', () => {
    renderHome()
    fireEvent.click(screen.getByLabelText('Próximo mês'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('dezembro de 2026')
    fireEvent.click(screen.getByText('Voltar para o mês atual'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('novembro de 2026')
  })
})

describe('Cadastro de conta', () => {
  const renderForm = () =>
    render(
      <MemoryRouter initialEntries={['/contas/nova']}>
        <Routes>
          <Route path="/contas/nova" element={<BillForm />} />
          <Route path="/contas" element={<p>lista de contas</p>} />
        </Routes>
      </MemoryRouter>,
    )

  const fill = (label: string | RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }).closest('form')!)

  it('salva em centavos e volta para a lista', async () => {
    renderForm()
    fill('Nome', 'Internet')
    fill(/Valor/, '129,90')
    fill('Dia do vencimento', '28')
    submit()

    await waitFor(() => expect(store.saveBill).toHaveBeenCalled())
    const [uid, input, today] = store.saveBill.mock.calls[0]
    expect(uid).toBe('u1')
    expect(today).toBe(TODAY)
    expect(input).toMatchObject({
      name: 'Internet',
      expectedAmountCents: 12990,
      dueDay: 28,
      recurrence: 'monthly',
      startMonth: '2026-11',
      active: true,
    })
    await screen.findByText('lista de contas')
  })

  it.each([
    ['sem nome', { Nome: '', valor: '10', dia: '5' }, 'Informe o nome da conta.'],
    ['valor inválido', { Nome: 'X', valor: 'abc', dia: '5' }, 'Informe um valor válido'],
    ['dia fora do intervalo', { Nome: 'X', valor: '10', dia: '32' }, 'O dia de vencimento deve ser de 1 a 31.'],
  ])('rejeita %s', (_nome, v, mensagem) => {
    renderForm()
    fill('Nome', v.Nome)
    fill(/Valor/, v.valor)
    fill('Dia do vencimento', v.dia)
    submit()
    expect(screen.getByRole('alert').textContent).toContain(mensagem)
    expect(store.saveBill).not.toHaveBeenCalled()
  })

  it('rejeita CNPJ com dígito verificador errado', () => {
    renderForm()
    fill('Nome', 'X')
    fill(/Valor/, '10')
    fill('Dia do vencimento', '5')
    fill(/CNPJ/, '11.222.333/0001-82')
    submit()
    expect(screen.getByRole('alert').textContent).toContain('CNPJ inválido')
    expect(store.saveBill).not.toHaveBeenCalled()
  })

  it('o atalho preenche nome e categoria', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Condomínio' }))
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Condomínio')
    expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Moradia')
  })
})

describe('Início: conta variável sem valor', () => {
  it('fica pendente, pede o valor e não oferece o check de pagamento', () => {
    const zero = buildEntry(bill({ id: 'b9', name: 'Água', dueDay: 20, expectedAmountCents: 0 }), '2026-11')
    hooks.useEntries.mockReturnValue({ data: [zero], ready: true, error: null })
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    expect(text(screen.getByLabelText('Resumo do mês'))).toContain('1 conta pendente')
    expect(screen.getByText('Valor a informar')).toBeTruthy()
    expect(screen.queryByLabelText('Marcar Água como paga')).toBeNull()
  })
})
