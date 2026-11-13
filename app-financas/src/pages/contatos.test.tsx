// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURES } from '../components/FeatureList'
import { dismissWelcome } from '../data/welcome'
import { defaultRegistry } from '../domain/registry'
import type { Person, Receivable } from '../domain/types'

const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '11912345678', email: 'ana@x.com', charges: [] }
const frank: Person = { id: 'p2', name: 'Frank', phone: '', email: '', charges: [] }
const compra = (id: string): Receivable => ({
  id,
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 10000,
  installmentCount: 1,
  firstDueDate: '2026-11-20',
  installments: [{ number: 1, dueDate: '2026-11-20', amountCents: 10000, paidAt: null, paidAmountCents: null }],
  notes: '',
})

const live = <T,>(data: T[]) => ({ data, ready: true, error: null })
const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  useEntries: vi.fn(),
  useEntriesRange: vi.fn(),
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useRegistry: vi.fn(),
  useToday: vi.fn(() => '2026-11-13'),
  useAlertSettings: vi.fn(() => ({ data: { enabled: true, days: [1], hour: 8 }, ready: true, error: null })),
  usePushDevices: vi.fn(),
}))
const store = vi.hoisted(() => ({
  createPerson: vi.fn(() => ({ id: 'novo', done: Promise.resolve() })),
  updatePerson: vi.fn(() => Promise.resolve()),
  deletePerson: vi.fn(() => Promise.resolve()),
}))
vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import { AppRoutes } from '../App'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  dismissWelcome()
  vi.clearAllMocks()
  hooks.usePeople.mockReturnValue(live([frank, ana]))
  hooks.useReceivables.mockReturnValue(live([compra('r1'), compra('r2')]))
  hooks.useRegistry.mockReturnValue({ data: defaultRegistry(), ready: true, error: null })
  hooks.useBills.mockReturnValue(live([]))
  hooks.useEntries.mockReturnValue(live([]))
  hooks.useEntriesRange.mockReturnValue(live([]))
  hooks.usePushDevices.mockReturnValue(live([]))
})
afterEach(cleanup)

describe('Configurações > Contatos', () => {
  it('Configurações tem o item Contatos com a contagem', () => {
    renderAt('/cadastros')
    const link = screen.getByRole('link', { name: /Contatos/ })
    expect(link.textContent).toContain('2 contatos')
    expect(link.getAttribute('href')).toBe('/cadastros/contatos')
  })

  it('lista todos os contatos, com ou sem compra, em ordem alfabética', () => {
    renderAt('/cadastros/contatos')
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.row-title')!.textContent)).toEqual(['Ana Souza', 'Frank'])
    expect(rows[0].textContent).toContain('2 compras')
    expect(rows[1].textContent).toContain('Sem compras')
    expect(screen.getByRole('link', { name: 'Novo contato' }).getAttribute('href')).toBe('/cadastros/contatos/novo')
    const select = screen.getByLabelText('Ordenar por') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Nome', 'Número de compras'])
    expect(select.value).toBe('nome')
  })

  it('cria um contato sem compra', () => {
    renderAt('/cadastros/contatos/novo')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  Gina ' } })
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), { target: { value: '(21) 99876-5432' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(store.createPerson).toHaveBeenCalledWith('u1', { name: 'Gina', phone: '21998765432', email: '', tone: 'amigavel', charges: [] })
  })

  it('não salva sem nome', () => {
    renderAt('/cadastros/contatos/novo')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(screen.getByRole('alert').textContent).toBe('Informe o nome da pessoa.')
    expect(store.createPerson).not.toHaveBeenCalled()
  })

  it('edita mantendo o histórico, e leva às compras', () => {
    renderAt('/cadastros/contatos/p1')
    expect(screen.getByRole('heading', { level: 1, name: 'Editar contato' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@novo.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(store.updatePerson).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'p1', email: 'ana@novo.com', charges: [] }))
  })

  it('"Copiar e criar novo" abre um contato novo preenchido, sem salvar nada', () => {
    renderAt('/cadastros/contatos/p1')
    expect(screen.getByRole('link', { name: 'Ver as 2 compras' }).getAttribute('href')).toBe('/receber/pessoa/p1')
    expect(screen.getByRole('link', { name: /Copiar e criar novo/ }).getAttribute('href')).toBe('/cadastros/contatos/novo?copiar=p1')
    cleanup()
    renderAt('/cadastros/contatos/novo?copiar=p1')
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Ana Souza (cópia)')
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('ana@x.com')
    expect(store.createPerson).not.toHaveBeenCalled()
  })

  it('exclui pedindo confirmação; com compras, avisa e apaga as compras junto', () => {
    renderAt('/cadastros/contatos/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir contato e as 2 compras' }))
    expect(within(screen.getByRole('region', { name: 'Excluir contato' })).getByRole('alert').textContent).toMatch(/as 2 compras/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.deletePerson).toHaveBeenCalledWith('u1', 'p1', ['r1', 'r2'])
  })

  it('exclui um contato sem compra', () => {
    renderAt('/cadastros/contatos/p2')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir contato' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.deletePerson).toHaveBeenCalledWith('u1', 'p2', [])
  })

  it('A receber não mostra quem não tem compra', () => {
    renderAt('/receber')
    expect(screen.getByRole('link', { name: /Ana Souza/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Frank/ })).toBeNull()
  })
})

describe('Sobre', () => {
  it('fala de Configurações e dos contatos', () => {
    const item = FEATURES.find((f) => f.text.includes('fornecedores e contatos'))
    expect(item?.text).toMatch(/Configurações \(aba Ajustes\)/)
    expect(FEATURES.some((f) => f.text.includes('em Cadastros'))).toBe(false)
  })
})

describe('Agenda do celular no Novo contato', () => {
  const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
  const android = (select: ReturnType<typeof vi.fn>) => {
    ;(navigator as unknown as { contacts: unknown }).contacts = { select }
    ;(window as unknown as { ContactsManager: unknown }).ContactsManager = class {}
  }
  afterEach(() => {
    delete (navigator as unknown as { contacts?: unknown }).contacts
    delete (window as unknown as { ContactsManager?: unknown }).ContactsManager
    sessionStorage.clear()
  })

  it('preenche e diz o que recebeu, avisando quando o telefone vem sem DDD', async () => {
    android(vi.fn().mockResolvedValue([{ name: ['Mãe'], tel: ['98865-9770'], email: ['mae@exemplo.com'] }]))
    renderAt('/cadastros/contatos/novo')
    fireEvent.click(screen.getByRole('button', { name: 'Escolher da agenda do celular' }))
    await waitFor(() => expect(field('Nome').value).toBe('Mãe'))
    expect(field('Telefone / WhatsApp').value).toBe('98865-9770')
    expect(field('E-mail').value).toBe('mae@exemplo.com')
    const status = screen.getByRole('status').textContent!
    expect(status).toContain('Recebido: nome, telefone, e-mail.')
    expect(status).toContain('O telefone veio sem DDD')
  })

  it('se a tela for refeita enquanto a agenda está aberta, o contato recebido ainda preenche os campos', async () => {
    let resolve!: (v: unknown) => void
    android(vi.fn(() => new Promise((r) => (resolve = r))))
    const first = renderAt('/cadastros/contatos/novo')
    fireEvent.click(screen.getByRole('button', { name: 'Escolher da agenda do celular' }))
    first.unmount()
    renderAt('/cadastros/contatos/novo')
    resolve([{ name: ['Bia'], tel: ['(11) 91234-5678'], email: [] }])
    await waitFor(() => expect(field('Nome').value).toBe('Bia'))
    expect(field('Telefone / WhatsApp').value).toBe('(11) 91234-5678')
  })

  it('se a página recarregar com a agenda aberta, explica e sugere o arquivo .vcf', () => {
    android(vi.fn())
    sessionStorage.setItem('contas-em-dia:agenda-aberta', JSON.stringify({ at: Date.now(), path: window.location.pathname, value: true }))
    renderAt('/cadastros/contatos/novo')
    expect(screen.getByRole('alert').textContent).toContain('o app recarregou antes de receber o contato')
  })

  it('contato sem dados vindos da agenda: avisa e não apaga o que já foi digitado', async () => {
    android(vi.fn().mockResolvedValue([{ name: [], tel: [], email: [] }]))
    renderAt('/cadastros/contatos/novo')
    fireEvent.change(field('Nome'), { target: { value: 'Dani' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escolher da agenda do celular' }))
    expect((await screen.findByRole('alert')).textContent).toContain('sem nome, telefone nem e-mail')
    expect(field('Nome').value).toBe('Dani')
  })
})
