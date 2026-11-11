// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppHeader } from '../components/AppHeader'
import { PrivacyProvider } from '../data/privacy'
import { dismissWelcome } from '../data/welcome'
import { buildEntry } from '../domain/bills'
import { buildInstallments } from '../domain/receivables'
import type { Bill, Person, Receivable } from '../domain/types'

const TODAY = '2026-11-09'
const bill: Bill = {
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 23840,
  dueDay: 20,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  skippedMonths: [],
}
const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '', email: '', charges: [] }
const tenis: Receivable = {
  id: 'r1',
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 30000,
  installmentCount: 3,
  firstDueDate: '2026-10-10',
  installments: buildInstallments(30000, 3, '2026-10-10'),
  notes: '',
}

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  useEntries: vi.fn(),
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useToday: vi.fn(),
  useAlertSettings: vi.fn(() => ({ data: { enabled: true, days: [1], hour: 8 }, ready: true, error: null })),
  usePushDevices: vi.fn(() => ({ data: [], ready: true, error: null })),
  useEntriesRange: vi.fn(() => ({ data: [], ready: true, error: null })),
}))
const store = vi.hoisted(() => ({ ensureEntries: vi.fn(), payEntry: vi.fn(), skipEntry: vi.fn(), undoPayment: vi.fn(), updateEntryDetails: vi.fn() }))
vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import Home from './Home'
import Receivables from './Receivables'

beforeEach(() => {
  dismissWelcome()
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useBills.mockReturnValue({ data: [bill], ready: true, error: null })
  hooks.useEntries.mockReturnValue({ data: [buildEntry(bill, '2026-11')], ready: true, error: null })
  hooks.usePeople.mockReturnValue({ data: [ana], ready: true, error: null })
  hooks.useReceivables.mockReturnValue({ data: [tenis], ready: true, error: null })
  store.ensureEntries.mockResolvedValue(0)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

const flat = (s: string | null) => (s ?? '').replace(/ /g, ' ')

function renderApp(children: React.ReactNode) {
  return render(
    <MemoryRouter>
      <PrivacyProvider>
        <AppHeader />
        {children}
      </PrivacyProvider>
    </MemoryRouter>,
  )
}

describe('Ocultar valores (olhinho)', () => {
  it('no Início, esconde resumo, lista e detalhe da conta, e mostra de volta', () => {
    renderApp(<Home />)
    const summary = screen.getByLabelText('Resumo do mês')
    expect(flat(summary.textContent)).toContain('R$ 238,40')

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar valores' }))
    expect(flat(summary.textContent)).not.toMatch(/\d,\d{2}/)
    expect(flat(summary.textContent)).toContain('R$ ••••')
    expect(flat(document.querySelector('.list')!.textContent)).not.toMatch(/\d,\d{2}/)

    fireEvent.click(screen.getByText('Energia'))
    const dialog = screen.getByRole('dialog', { name: 'Energia' })
    expect(flat(dialog.querySelector('.facts')!.textContent)).not.toMatch(/\d,\d{2}/)

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar valores' }))
    expect(flat(summary.textContent)).toContain('R$ 238,40')
  })

  it('o aviso de atraso no Início não vaza o valor a receber', () => {
    hooks.useToday.mockReturnValue('2026-12-20')
    renderApp(<Home />)
    expect(flat(document.body.textContent)).toMatch(/A receber em atraso[^]*R\$ \d/)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar valores' }))
    const banner = screen.getByRole('link', { name: /A receber em atraso/ })
    expect(flat(banner.textContent)).not.toMatch(/\d,\d{2}/)
  })

  it('em A receber, esconde totais e previsão', () => {
    localStorage.setItem('contas-em-dia:ocultar-valores', '1')
    renderApp(<Receivables />)
    const summary = screen.getByLabelText('Resumo do que falta receber')
    expect(flat(summary.textContent)).not.toMatch(/\d,\d{2}/)
    expect(flat(summary.textContent)).toContain('R$ ••••')
  })
})
