// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissWelcome } from '../data/welcome'
import { buildEntry } from '../domain/bills'
import { buildInstallments } from '../domain/receivables'
import { defaultRegistry, type Registry } from '../domain/registry'
import type { Bill, Entry, Person, Receivable } from '../domain/types'

const TODAY = '2026-11-09'

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
  ...over,
})

// Padrão (vencimento): Condomínio (3), Energia (5), Seguro (20), Internet (28).
const energia = bill()
const internet = bill({ id: 'b3', name: 'Internet', dueDay: 28, expectedAmountCents: 12990 })
const condominio = bill({ id: 'b2', name: 'Condomínio', dueDay: 3, expectedAmountCents: 50000 })
const seguro = bill({ id: 'b4', name: 'Seguro', dueDay: 20, expectedAmountCents: 8000 })
const bills = [energia, internet, condominio, seguro]
const entries: Entry[] = [
  buildEntry(internet, '2026-11'),
  buildEntry(energia, '2026-11'),
  { ...buildEntry(condominio, '2026-11'), paidAt: '2026-11-03', paidAmountCents: 50000 },
  buildEntry(seguro, '2026-11'),
]

const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '', email: '', charges: [] }
const bruno: Person = { id: 'p2', name: 'Bruno Lima', phone: '', email: '', charges: [] }
const carla: Person = { id: 'p3', name: 'Carla Dias', phone: '', email: '', charges: [] }
const purchase = (id: string, personId: string, description: string, total: number, first: string, count = 2): Receivable => ({
  id,
  personId,
  kind: 'cartao',
  description,
  totalCents: total,
  installmentCount: count,
  firstDueDate: first,
  installments: buildInstallments(total, count, first),
  notes: '',
})
// Ana: atrasada (R$ 600). Carla: próxima parcela em 20/11 (R$ 100). Bruno: sem compras (não aparece em A receber).
const receivables = [
  purchase('r1', 'p1', 'Geladeira', 60000, '2026-10-05'),
  purchase('r2', 'p1', 'Bicicleta', 20000, '2026-12-10'),
  purchase('r3', 'p1', 'Celular', 40000, '2026-11-25'),
  purchase('r4', 'p3', 'Tênis', 10000, '2026-11-20'),
]

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  useEntries: vi.fn(),
  useEntriesRange: vi.fn(() => ({ data: [], ready: true, error: null })),
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useRegistry: vi.fn(),
  useToday: vi.fn(),
  useAlertSettings: vi.fn(() => ({ data: { enabled: true, days: [1], hour: 8 }, ready: true, error: null })),
  usePushDevices: vi.fn(() => ({ data: [], ready: true, error: null })),
}))
const store = vi.hoisted(() => ({
  ensureEntries: vi.fn(),
  saveRegistry: vi.fn(),
  saveBill: vi.fn(),
  moveCategory: vi.fn(),
  movePayment: vi.fn(),
  renameSupplierInBills: vi.fn(),
}))
vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import { AppRoutes } from '../App'

const live = <T,>(data: T[]) => ({ data, ready: true, error: null })

function setup(over: { bills?: Bill[]; entries?: Entry[]; people?: Person[]; receivables?: Receivable[]; registry?: Registry } = {}) {
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useBills.mockReturnValue(live(over.bills ?? bills))
  hooks.useEntries.mockReturnValue(live(over.entries ?? entries))
  hooks.usePeople.mockReturnValue(live(over.people ?? [ana, bruno, carla]))
  hooks.useReceivables.mockReturnValue(live(over.receivables ?? receivables))
  hooks.useRegistry.mockReturnValue({ data: over.registry ?? defaultRegistry(), ready: true, error: null })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  dismissWelcome()
  setup()
  store.ensureEntries.mockResolvedValue(0)
  store.saveRegistry.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

const titles = () => Array.from(document.querySelectorAll('.row-title')).map((el) => el.textContent)
const bar = (name: string) => within(screen.getByRole('group', { name }))
const pick = (group: string, option: string) => {
  const select = bar(group).getByLabelText('Ordenar por') as HTMLSelectElement
  const value = Array.from(select.options).find((o) => o.textContent === option)!.value
  fireEvent.change(select, { target: { value } })
}
const dirButton = (group: string) => bar(group).getByRole('button')

describe('Ordenação no Início', () => {
  const GROUP = 'Ordenação das contas do mês'
  // Aqui o assunto é a ordem das contas: filtro "A pagar" (o padrão Tudo traz também o que se recebe).
  beforeEach(() => window.localStorage.setItem('contas-em-dia:escolha:inicio-lado', 'pagar'))

  it('abre em ordem alfabética (Nome, A–Z), com o seletor visível em texto; Vencimento continua disponível', () => {
    renderAt('/')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Internet', 'Seguro'])
    const select = bar(GROUP).getByLabelText('Ordenar por') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Nome', 'Vencimento', 'Valor'])
    expect(select.selectedOptions[0].textContent).toBe('Nome')
    expect(dirButton(GROUP).textContent).toContain('Crescente')
    pick(GROUP, 'Vencimento')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Seguro', 'Internet'])
  })

  it('ordena por valor (do maior para o menor) e o botão inverte', () => {
    renderAt('/')
    pick(GROUP, 'Valor')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Internet', 'Seguro'])
    expect(dirButton(GROUP).textContent).toContain('Decrescente')
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Seguro', 'Internet', 'Energia', 'Condomínio'])
    expect(dirButton(GROUP).textContent).toContain('Crescente')
  })

  it('ordena por nome, nos dois sentidos', () => {
    renderAt('/')
    pick(GROUP, 'Nome')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Internet', 'Seguro'])
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Seguro', 'Internet', 'Energia', 'Condomínio'])
  })

  it('a escolha fica guardada neste aparelho e volta na próxima visita', () => {
    const first = renderAt('/')
    pick(GROUP, 'Valor')
    first.unmount()
    renderAt('/')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Internet', 'Seguro'])
    expect((bar(GROUP).getByLabelText('Ordenar por') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Valor')
  })

  it('cada tela tem a sua ordem: mudar no Início não mexe em A pagar', () => {
    const first = renderAt('/')
    pick(GROUP, 'Nome')
    fireEvent.click(dirButton(GROUP))
    first.unmount()
    renderAt('/contas')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Internet', 'Seguro']) // padrão de A pagar: por nome
    expect(dirButton('Ordenação das contas cadastradas').textContent).toContain('Crescente')
  })

  it('com uma conta só, não há o que ordenar e o seletor não aparece', () => {
    setup({ entries: [entries[0]] })
    renderAt('/')
    expect(screen.queryByLabelText('Ordenar por')).toBeNull()
  })
})

describe('Ordenação em A pagar', () => {
  const GROUP = 'Ordenação das contas cadastradas'

  it('abre por nome e oferece nome, valor e dia do vencimento', () => {
    renderAt('/contas')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Internet', 'Seguro'])
    const select = bar(GROUP).getByLabelText('Ordenar por') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Nome', 'Valor', 'Dia do vencimento'])
  })

  it('ordena por valor e por dia do vencimento', () => {
    renderAt('/contas')
    pick(GROUP, 'Valor')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Internet', 'Seguro'])
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Seguro', 'Internet', 'Energia', 'Condomínio'])
    pick(GROUP, 'Dia do vencimento')
    expect(titles()).toEqual(['Condomínio', 'Energia', 'Seguro', 'Internet'])
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Internet', 'Seguro', 'Energia', 'Condomínio'])
  })

  it('contas arquivadas ficam sempre no fim', () => {
    setup({ bills: [bills[0], { ...bills[2], active: false }, bills[1], bills[3]] })
    renderAt('/contas')
    pick(GROUP, 'Valor')
    expect(titles().at(-1)).toBe('Condomínio')
    fireEvent.click(dirButton(GROUP))
    expect(titles().at(-1)).toBe('Condomínio')
  })
})

describe('Ordenação em A receber', () => {
  const GROUP = 'Ordenação das pessoas'

  it('abre por nome; a situação (atrasados primeiro) não tem botão de sentido', () => {
    renderAt('/receber')
    expect(titles()).toEqual(['Ana Souza', 'Carla Dias'])
    const select = bar(GROUP).getByLabelText('Ordenar por') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Nome', 'Situação (atrasados primeiro)', 'Valor a receber', 'Próximo vencimento'])
    expect(select.selectedOptions[0].textContent).toBe('Nome')
    pick(GROUP, 'Situação (atrasados primeiro)')
    expect(bar(GROUP).queryByRole('button')).toBeNull()
  })

  it('ordena por nome, valor a receber e próximo vencimento', () => {
    renderAt('/receber')
    pick(GROUP, 'Nome')
    expect(titles()).toEqual(['Ana Souza', 'Carla Dias'])
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Carla Dias', 'Ana Souza'])
    pick(GROUP, 'Valor a receber')
    expect(titles()).toEqual(['Ana Souza', 'Carla Dias'])
    pick(GROUP, 'Próximo vencimento')
    expect(titles()).toEqual(['Ana Souza', 'Carla Dias']) // Ana (05/10, atrasada), Carla (20/11)
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Carla Dias', 'Ana Souza'])
  })

  it('a ordem escolhida fica guardada', () => {
    const first = renderAt('/receber')
    pick(GROUP, 'Nome')
    fireEvent.click(dirButton(GROUP))
    first.unmount()
    renderAt('/receber')
    expect(titles()).toEqual(['Carla Dias', 'Ana Souza'])
  })
})

describe('Ordenação das compras de uma pessoa', () => {
  const GROUP = 'Ordenação das compras'
  const purchases = () =>
    Array.from(document.querySelectorAll('section.card[aria-label] > * h2, section.card[aria-label] h2'))
      .map((h) => h.textContent)
      .filter((t) => ['Geladeira', 'Bicicleta', 'Celular'].includes(t ?? ''))

  it('abre por nome da compra e ordena pela situação, valor e próxima parcela', () => {
    renderAt('/receber/pessoa/p1')
    expect(purchases()).toEqual(['Bicicleta', 'Celular', 'Geladeira'])
    pick(GROUP, 'Situação (com saldo primeiro)')
    expect(purchases()).toEqual(['Geladeira', 'Celular', 'Bicicleta'])
    pick(GROUP, 'Nome da compra')
    expect(purchases()).toEqual(['Bicicleta', 'Celular', 'Geladeira'])
    pick(GROUP, 'Valor da compra')
    expect(purchases()).toEqual(['Geladeira', 'Celular', 'Bicicleta'])
    fireEvent.click(dirButton(GROUP))
    expect(purchases()).toEqual(['Bicicleta', 'Celular', 'Geladeira'])
    pick(GROUP, 'Próxima parcela')
    expect(purchases()).toEqual(['Geladeira', 'Celular', 'Bicicleta'])
  })

  it('com uma compra só, não aparece o seletor', () => {
    renderAt('/receber/pessoa/p3')
    expect(screen.queryByLabelText('Ordenar por')).toBeNull()
  })
})

describe('Ordenação nos Cadastros', () => {
  it('categorias: por nome A–Z por padrão (e Z–A), ou na ordem de cadastro', () => {
    const reg = { ...defaultRegistry(), categories: ['Viagens', 'Moradia', 'Água'] }
    setup({ registry: reg })
    renderAt('/cadastros/categorias')
    const GROUP = 'Ordenação de categorias'
    expect(titles()).toEqual(['Água', 'Moradia', 'Viagens'])
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Viagens', 'Moradia', 'Água'])
    pick(GROUP, 'Ordem de cadastro')
    expect(titles()).toEqual(['Viagens', 'Moradia', 'Água'])
    expect(bar(GROUP).queryByRole('button')).toBeNull()
  })

  it('formas de pagamento e fornecedores têm a sua própria ordem guardada', () => {
    const reg = { ...defaultRegistry(), suppliers: ['Zeca', 'Ana', 'Marta'] }
    setup({ registry: reg })
    const first = renderAt('/cadastros/fornecedores')
    pick('Ordenação de fornecedores', 'Ordem de cadastro')
    expect(titles()).toEqual(['Zeca', 'Ana', 'Marta'])
    first.unmount()
    renderAt('/cadastros/pagamentos')
    expect(screen.getByRole('group', { name: 'Ordenação de formas de pagamento' })).toBeTruthy()
    expect((bar('Ordenação de formas de pagamento').getByLabelText('Ordenar por') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Nome')
  })

  it('atalhos: por nome, valor e dia, e o que não tem valor ou dia fica no fim', () => {
    const base = defaultRegistry()
    const t = (id: string, name: string, amountCents: number, dueDay: number | null) => ({ ...base.templates[0], id, name, amountCents, dueDay })
    const reg = { ...base, templates: [t('t1', 'Seguro', 30000, 20), t('t2', 'Academia', 0, null), t('t3', 'Internet', 12990, 5), t('t4', 'Condomínio', 50000, null)] }
    setup({ registry: reg })
    renderAt('/cadastros/atalhos')
    const GROUP = 'Ordenação dos atalhos'
    expect(titles()).toEqual(['Academia', 'Condomínio', 'Internet', 'Seguro'])
    pick(GROUP, 'Ordem de cadastro')
    expect(titles()).toEqual(['Seguro', 'Academia', 'Internet', 'Condomínio'])
    pick(GROUP, 'Valor')
    expect(titles()).toEqual(['Condomínio', 'Seguro', 'Internet', 'Academia'])
    pick(GROUP, 'Dia do vencimento')
    expect(titles()).toEqual(['Internet', 'Seguro', 'Academia', 'Condomínio'])
    fireEvent.click(dirButton(GROUP))
    expect(titles()).toEqual(['Seguro', 'Internet', 'Academia', 'Condomínio'])
  })
})
