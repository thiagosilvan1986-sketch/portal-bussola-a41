// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Suggestion } from '../domain/suggestions'
import type { Bill } from '../domain/types'

const hooks = vi.hoisted(() => ({
  useSuggestions: vi.fn(),
  useBills: vi.fn(),
  useGmailStatus: vi.fn(),
  useToday: vi.fn(),
}))
const store = vi.hoisted(() => ({
  acceptApplyCharge: vi.fn(),
  acceptNewBill: vi.fn(),
  dismissSuggestion: vi.fn(),
  trustSender: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' } }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import Suggestions from './Suggestions'

const bill: Bill = {
  id: 'b1',
  name: 'Internet Vivo',
  category: 'Internet e telefonia',
  supplier: 'Vivo',
  cnpj: '',
  valueType: 'fixed',
  expectedAmountCents: 12990,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
}

const base = {
  status: 'pending' as const,
  createdAt: '2026-11-10T10:00:00.000Z',
  from: 'Vivo <fatura@vivo.com.br>',
  subject: 'Sua fatura',
  receivedAt: '2026-11-09',
  senderKey: 'vivo.com.br',
  cnpj: '',
}

const change: Suggestion = {
  ...base,
  id: 'm1',
  type: 'apply_charge',
  billId: 'b1',
  billName: 'Internet Vivo',
  entryId: 'b1_2026-12',
  competence: '2026-12',
  patch: { chargedAmountCents: 15990 },
  previous: { amountCents: 12990, dueDate: '2026-12-10' },
}

const newBill: Suggestion = {
  ...base,
  id: 'm2',
  type: 'new_bill',
  from: 'Enel <cobranca@enel.com.br>',
  senderKey: 'enel.com.br',
  draft: {
    name: 'Enel',
    supplier: 'Enel',
    cnpj: '',
    category: 'Contas de consumo',
    valueType: 'fixed',
    expectedAmountCents: 24510,
    dueDay: 15,
    recurrence: 'monthly',
    startMonth: '2026-12',
    paymentMethod: 'boleto',
    amountCents: 24510,
    dueDate: '2026-12-15',
    barcode: '',
  },
}

const scam: Suggestion = {
  ...base,
  id: 'm3',
  type: 'scam_alert',
  billId: 'b1',
  signals: ['pede_pix_ou_transferencia_para_chave_nova', 'remetente_diferente_do_habitual'],
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\u00a0/g, ' ')

beforeEach(() => {
  hooks.useToday.mockReturnValue('2026-11-10')
  hooks.useBills.mockReturnValue({ data: [bill], ready: true, error: null })
  hooks.useGmailStatus.mockReturnValue({ connected: true, ready: true })
  hooks.useSuggestions.mockReturnValue({ data: [change, newBill, scam], ready: true, error: null })
  for (const fn of Object.values(store)) fn.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <Suggestions />
    </MemoryRouter>,
  )

describe('Sugestões', () => {
  it('mostra o valor antigo e o novo, em reais', () => {
    renderPage()
    const t = text(screen.getByText('Internet Vivo').closest('li'))
    expect(t).toContain('Valor diferente')
    expect(t).toContain('R$ 129,90')
    expect(t).toContain('R$ 159,90')
  })

  it('"Atualizar" aplica a sugestão com as contas atuais', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(store.acceptApplyCharge).toHaveBeenCalledWith('u1', change, [bill]))
  })

  it('"Cadastrar" cria a conta sugerida', async () => {
    renderPage()
    expect(text(screen.getByText('Nova conta: Enel').closest('li'))).toContain('R$ 245,10')
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await waitFor(() => expect(store.acceptNewBill).toHaveBeenCalledWith('u1', newBill, '2026-11-10'))
  })

  it('pode silenciar o remetente', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Nunca sugerir deste remetente' }))
    await waitFor(() => expect(store.dismissSuggestion).toHaveBeenCalledWith('u1', newBill, true))
  })

  it('o alerta de golpe explica os sinais e não altera nada sozinho', () => {
    renderPage()
    const card = screen.getByText('Possível golpe').closest('li')!
    const t = text(card)
    expect(t).toContain('nada foi alterado')
    expect(t).toContain('Pede PIX ou transferência para uma chave nova')
    expect(t).toContain('remetente diferente do habitual')
    expect(store.trustSender).not.toHaveBeenCalled()
  })

  it('"É legítimo" aceita o remetente', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /É legítimo/ }))
    await waitFor(() => expect(store.trustSender).toHaveBeenCalledWith('u1', scam))
  })

  it('se algo falha, avisa e deixa tentar de novo', async () => {
    store.acceptApplyCharge.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await screen.findByText('Não foi possível concluir. Tente de novo.')
    expect((screen.getByRole('button', { name: 'Atualizar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('sem sugestões e sem Gmail, convida a conectar', () => {
    hooks.useSuggestions.mockReturnValue({ data: [], ready: true, error: null })
    hooks.useGmailStatus.mockReturnValue({ connected: false, ready: true })
    renderPage()
    expect(screen.getByRole('link', { name: 'Conectar o Gmail' }).getAttribute('href')).toBe('/ajustes')
  })

  it('sem sugestões e com Gmail, diz que não há nada para decidir', () => {
    hooks.useSuggestions.mockReturnValue({ data: [], ready: true, error: null })
    renderPage()
    expect(screen.getByText('Nada para decidir agora')).toBeTruthy()
  })
})
