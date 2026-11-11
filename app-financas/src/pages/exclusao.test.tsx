// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissWelcome } from '../data/welcome'
import { billAppliesTo, buildEntry, missingEntries } from '../domain/bills'
import { removeCharge } from '../domain/receivables'
import type { Bill } from '../domain/types'

const TODAY = '2026-11-09'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'variable',
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

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  useEntries: vi.fn(),
  useReceivables: vi.fn(),
  useToday: vi.fn(),
}))
const store = vi.hoisted(() => ({
  deleteBill: vi.fn(),
  ensureEntries: vi.fn(),
  payEntry: vi.fn(),
  restoreMonth: vi.fn(),
  saveBill: vi.fn(),
  skipEntry: vi.fn(),
  undoPayment: vi.fn(),
  updateEntryDetails: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import BillForm from './BillForm'
import Home from './Home'

beforeEach(() => {
  dismissWelcome()
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useBills.mockReturnValue({ data: [bill()], ready: true, error: null })
  hooks.useEntries.mockReturnValue({ data: [buildEntry(bill(), '2026-11')], ready: true, error: null })
  hooks.useReceivables.mockReturnValue({ data: [], ready: true, error: null })
  store.ensureEntries.mockResolvedValue(0)
  store.deleteBill.mockResolvedValue(undefined)
  store.skipEntry.mockResolvedValue(undefined)
  store.restoreMonth.mockResolvedValue(undefined)
  store.saveBill.mockResolvedValue('b1')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('regra: mês excluído não volta', () => {
  it('a conta não gera lançamento nos meses excluídos', () => {
    const b = bill({ skippedMonths: ['2026-12'] })
    expect(billAppliesTo(b, '2026-11')).toBe(true)
    expect(billAppliesTo(b, '2026-12')).toBe(false)
  })

  it('contas antigas, sem a lista, continuam funcionando', () => {
    const { skippedMonths: _ignored, ...antiga } = bill()
    expect(billAppliesTo(antiga, '2026-12')).toBe(true)
  })

  it('o Início não recria o lançamento excluído', () => {
    const b = bill({ skippedMonths: ['2026-11'] })
    expect(missingEntries([b], new Set(), ['2026-11', '2026-12']).map((e) => e.competence)).toEqual(['2026-12'])
  })

  it('tira uma cobrança do histórico pela posição', () => {
    const log = (date: string) => ({ date, channel: 'whatsapp' as const, totalCents: 100, overdue: false })
    expect(removeCharge([log('2026-10-01'), log('2026-10-02'), log('2026-10-03')], 1).map((c) => c.date)).toEqual(['2026-10-01', '2026-10-03'])
    expect(removeCharge(undefined, 0)).toEqual([])
  })
})

describe('Excluir conta', () => {
  const renderEdit = () =>
    render(
      <MemoryRouter initialEntries={['/contas/b1/editar']}>
        <Routes>
          <Route path="/contas/:id/editar" element={<BillForm />} />
          <Route path="/contas" element={<p>lista de contas</p>} />
        </Routes>
      </MemoryRouter>,
    )

  it('só apaga depois de confirmar, avisa o que será perdido e volta para a lista', async () => {
    renderEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))
    expect(store.deleteBill).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('histórico de pagamentos')

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.deleteBill).toHaveBeenCalledWith('u1', 'b1'))
    await screen.findByText('lista de contas')
  })

  it('cancelar não apaga nada', () => {
    renderEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(store.deleteBill).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Excluir conta' })).toBeTruthy()
  })

  it('se a exclusão falhar, avisa e fica na tela', async () => {
    store.deleteBill.mockRejectedValue(new Error('sem permissão'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(screen.getByText('Não foi possível excluir. Tente de novo.')).toBeTruthy())
    expect(screen.queryByText('lista de contas')).toBeNull()
  })

  it('não oferece exclusão no cadastro de uma conta nova', () => {
    render(
      <MemoryRouter initialEntries={['/contas/nova']}>
        <Routes>
          <Route path="/contas/nova" element={<BillForm />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Excluir conta' })).toBeNull()
  })

  it('lista os meses excluídos e permite restaurar', () => {
    hooks.useBills.mockReturnValue({ data: [bill({ skippedMonths: ['2026-09', '2026-10'] })], ready: true, error: null })
    renderEdit()
    const buttons = screen.getAllByRole('button', { name: 'Restaurar' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0]) // o mais recente vem primeiro
    expect(store.restoreMonth).toHaveBeenCalledWith('u1', 'b1', '2026-10')
  })

  it('salvar a conta não manda a lista de meses excluídos (o armazenamento a preserva)', async () => {
    hooks.useBills.mockReturnValue({ data: [bill({ skippedMonths: ['2026-10'] })], ready: true, error: null })
    renderEdit()
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }).closest('form')!)
    await waitFor(() => expect(store.saveBill).toHaveBeenCalled())
    expect(store.saveBill.mock.calls[0][1]).not.toHaveProperty('skippedMonths')
  })
})

describe('Excluir lançamento do mês', () => {
  const open = () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Energia'))
  }

  it('apaga só aquele mês, depois de confirmar', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir novembro de 2026' }))
    expect(store.skipEntry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.skipEntry).toHaveBeenCalledTimes(1)
    const [uid, entry, billExists] = store.skipEntry.mock.calls[0]
    expect(uid).toBe('u1')
    expect(entry.id).toBe('b1_2026-11')
    expect(billExists).toBe(true)
  })

  it('lançamento de uma conta que já não existe também pode ser apagado', () => {
    hooks.useBills.mockReturnValue({ data: [bill({ id: 'b2', name: 'Outra' })], ready: true, error: null })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir novembro de 2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.skipEntry.mock.calls[0][2]).toBe(false)
  })
})
