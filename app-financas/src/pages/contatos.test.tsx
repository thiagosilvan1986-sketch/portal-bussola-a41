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
  createPeople: vi.fn(() => Promise.resolve()),
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
    const rows = Array.from(document.querySelectorAll('main > ul.list > li'))
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

describe('Importar contato no Novo contato', () => {
  const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
  const upload = (text: string) =>
    fireEvent.change(screen.getByLabelText('Arquivo de contato (.vcf)'), { target: { files: [new File([text], 'c.vcf', { type: 'text/vcard' })] } })

  it('só tem a importação por arquivo, com o passo a passo aberto na tela', () => {
    ;(navigator as unknown as { contacts: unknown }).contacts = { select: vi.fn() }
    ;(window as unknown as { ContactsManager: unknown }).ContactsManager = class {}
    renderAt('/cadastros/contatos/novo')
    expect(screen.queryByRole('button', { name: /agenda do celular/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Importar contato (.vcf)' })).toBeTruthy()
    const howto = screen.getByText('Como importar da agenda do celular').closest('details')!
    expect(howto.open).toBe(true)
    expect(howto.textContent).toContain('Android (Samsung e outros)')
    expect(howto.textContent).toContain('iPhone')
    delete (navigator as unknown as { contacts?: unknown }).contacts
    delete (window as unknown as { ContactsManager?: unknown }).ContactsManager
  })

  it('preenche e diz o que recebeu, avisando quando o telefone vem sem DDD', async () => {
    renderAt('/cadastros/contatos/novo')
    upload('BEGIN:VCARD\nVERSION:3.0\nFN:Mãe\nTEL;type=CELL:98865-9770\nEMAIL:mae@exemplo.com\nEND:VCARD')
    await waitFor(() => expect(field('Nome').value).toBe('Mãe'))
    expect(field('E-mail').value).toBe('mae@exemplo.com')
    const status = screen.getByRole('status').textContent!
    expect(status).toContain('Recebido: nome, telefone, e-mail.')
    expect(status).toContain('O telefone veio sem DDD')
  })
})

describe('Importar vários contatos de uma vez', () => {
  const card = (fn: string, tel = '', email = '') =>
    `BEGIN:VCARD\nVERSION:3.0\nFN:${fn}\n${tel ? `TEL;type=CELL:${tel}\n` : ''}${email ? `EMAIL:${email}\n` : ''}END:VCARD`
  const upload = (text: string) =>
    fireEvent.change(screen.getByLabelText('Arquivo de contatos (.vcf)'), { target: { files: [new File([text], 'c.vcf', { type: 'text/vcard' })] } })
  const rows = () => Array.from(document.querySelectorAll('.import-contacts > li'))

  it('lista todos do arquivo, deixa desmarcado quem já existe e cria os marcados de uma vez', async () => {
    renderAt('/cadastros/contatos')
    expect(screen.getByText(/toque e segure um contato, marque os outros/)).toBeTruthy()
    // Ana já existe (mesmo telefone, outro jeito de escrever); Mãe e Pai são novos; Pai repetido no arquivo
    upload([card('Mãe', '(21) 98865-9770'), card('Ana S.', '+55 11 91234-5678'), card('Pai', '', 'pai@x.com'), card('pai')].join('\n'))
    await waitFor(() => expect(rows()).toHaveLength(4))
    const boxes = rows().map((r) => (r.querySelector('input') as HTMLInputElement).checked)
    expect(boxes).toEqual([true, false, true, false])
    expect(rows()[1].textContent).toContain('Já cadastrado')
    expect(rows()[3].textContent).toContain('Já cadastrado')
    fireEvent.click(screen.getByRole('button', { name: 'Importar 2 contatos' }))
    await waitFor(() => expect(store.createPeople).toHaveBeenCalled())
    expect(store.createPeople).toHaveBeenCalledWith('u1', [
      { name: 'Mãe', phone: '21988659770', email: '', tone: 'amigavel', charges: [] },
      { name: 'Pai', phone: '', email: 'pai@x.com', tone: 'amigavel', charges: [] },
    ])
    expect((await screen.findByRole('status')).textContent).toBe('2 contatos importados. 2 ficaram de fora.')
  })

  it('dá para marcar um repetido e importar mesmo assim, ou cancelar sem salvar', async () => {
    renderAt('/cadastros/contatos')
    upload(card('Frank'))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect((screen.getByRole('button', { name: 'Importar 0 contatos' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(rows()[0].querySelector('input')!)
    expect(screen.getByRole('button', { name: 'Importar 1 contato' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(rows()).toHaveLength(0)
    expect(store.createPeople).not.toHaveBeenCalled()
  })

  it('contato sem nome usa o telefone; telefone sem DDD é avisado', async () => {
    renderAt('/cadastros/contatos')
    upload('BEGIN:VCARD\nVERSION:3.0\nTEL:98865-9770\nEND:VCARD')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0].querySelector('.row-title')!.textContent).toBe('98865-9770')
    expect(rows()[0].textContent).toContain('Telefone sem DDD')
  })

  it('arquivo sem contato avisa', async () => {
    renderAt('/cadastros/contatos')
    upload('nada aqui')
    expect((await screen.findByRole('alert')).textContent).toContain('Não encontrei nenhum contato')
  })
})
