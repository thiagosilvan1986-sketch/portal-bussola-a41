// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURES } from '../components/FeatureList'
import { defaultRegistry, type Registry } from '../domain/registry'
import type { Bill } from '../domain/types'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Ração',
  category: 'Pets',
  supplier: 'Petz',
  valueType: 'fixed',
  expectedAmountCents: 8000,
  dueDay: 5,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'pix',
  notes: '',
  active: true,
  ...over,
})

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  useEntries: vi.fn(),
  useEntriesRange: vi.fn(),
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useRegistry: vi.fn(),
  useToday: vi.fn(),
}))
const store = vi.hoisted(() => ({
  saveRegistry: vi.fn(),
  moveCategory: vi.fn(),
  movePayment: vi.fn(),
  renameSupplierInBills: vi.fn(),
  saveBill: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import { AppRoutes } from '../App'

function setup(registry: Registry = defaultRegistry(), bills: Bill[] = [bill()], ready = true) {
  hooks.useToday.mockReturnValue('2026-11-09')
  hooks.useRegistry.mockReturnValue({ data: registry, ready, error: null })
  hooks.useBills.mockReturnValue({ data: bills, ready: true, error: null })
  hooks.usePeople.mockReturnValue({ data: [], ready: true, error: null })
  hooks.useReceivables.mockReturnValue({ data: [], ready: true, error: null })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setup()
  store.saveRegistry.mockResolvedValue(undefined)
  store.moveCategory.mockResolvedValue(undefined)
  store.movePayment.mockResolvedValue(undefined)
  store.renameSupplierInBills.mockResolvedValue(undefined)
  store.saveBill.mockResolvedValue('new-id')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const lastSaved = () => store.saveRegistry.mock.calls.at(-1)![1] as Registry
const row = (name: string) => screen.getByText(name, { selector: '.row-title' }).closest('li') as HTMLElement

describe('menu Cadastros', () => {
  it('reúne os pré-cadastros e os dados (planilhas), sem Sair nem "Ver apresentação"', () => {
    renderAt('/cadastros')
    expect(screen.getByRole('heading', { level: 1, name: 'Cadastros' })).toBeTruthy()
    const pre = within(screen.getByRole('region', { name: 'Pré-cadastros' }))
    expect(pre.getByRole('link', { name: /Categorias/ }).getAttribute('href')).toBe('/cadastros/categorias')
    expect(pre.getByRole('link', { name: /Formas de pagamento/ }).getAttribute('href')).toBe('/cadastros/pagamentos')
    expect(pre.getByRole('link', { name: /Atalhos de conta/ }).getAttribute('href')).toBe('/cadastros/atalhos')
    expect(pre.getByRole('link', { name: /Fornecedores/ }).getAttribute('href')).toBe('/cadastros/fornecedores')
    expect(pre.getByText('14 categorias')).toBeTruthy()
    expect(pre.getByText('Cadastro opcional')).toBeTruthy()
    const data = within(screen.getByRole('region', { name: 'Dados e conta' }))
    expect(data.getByRole('link', { name: /Planilhas/ }).getAttribute('href')).toBe('/cadastros/planilhas')
    expect(data.getByText('Conectado como a@b.c')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Sair/ })).toBeNull()
    expect(screen.queryByText('Ver apresentação')).toBeNull()
  })

  it('os endereços antigos de Ajustes continuam funcionando', () => {
    renderAt('/ajustes')
    expect(screen.getByRole('heading', { level: 1, name: 'Cadastros' })).toBeTruthy()
    cleanup()
    renderAt('/ajustes/planilhas')
    expect(screen.getByRole('heading', { level: 1, name: 'Planilhas (CSV)' })).toBeTruthy()
  })

  it('a importação de planilha fica acessível a partir de Cadastros', () => {
    renderAt('/cadastros/planilhas')
    expect(screen.getByRole('heading', { level: 1, name: 'Planilhas (CSV)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar' }).getAttribute('href')).toBe('/cadastros')
  })
})

describe('Categorias', () => {
  it('lista com o uso de cada uma e protege “Outros”', () => {
    renderAt('/cadastros/categorias')
    expect(within(row('Pets')).getByText('Usada em 1 conta')).toBeTruthy()
    expect(within(row('Moradia')).getByText('Nenhuma conta usa')).toBeTruthy()
    const outros = row('Outros')
    expect(within(outros).getByText(/Padrão do app/)).toBeTruthy()
    expect(within(outros).queryByRole('button')).toBeNull()
  })

  it('cria uma categoria nova (antes de Outros)', async () => {
    renderAt('/cadastros/categorias')
    fireEvent.change(screen.getByLabelText('Nova categoria'), { target: { value: 'Viagens' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    expect(store.saveRegistry.mock.calls[0][0]).toBe('u1')
    expect(lastSaved().categories.slice(-2)).toEqual(['Viagens', 'Outros'])
    expect((screen.getByLabelText('Nova categoria') as HTMLInputElement).value).toBe('')
  })

  it('recusa nome repetido e vazio, sem gravar nada', async () => {
    renderAt('/cadastros/categorias')
    expect((screen.getByRole('button', { name: 'Adicionar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Nova categoria'), { target: { value: 'pets' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Já existe “pets”.')
    expect(store.saveRegistry).not.toHaveBeenCalled()
  })

  it('renomear atualiza as contas e lançamentos que usam o nome', async () => {
    renderAt('/cadastros/categorias')
    fireEvent.click(within(row('Pets')).getByRole('button', { name: 'Renomear' }))
    expect(screen.getByText(/passa(m)? a mostrar o nome novo/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Novo nome'), { target: { value: 'Animais' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
    await waitFor(() => expect(store.moveCategory).toHaveBeenCalledTimes(1))
    const [uid, from, to, reg] = store.moveCategory.mock.calls[0] as [string, string, string, Registry]
    expect([uid, from, to]).toEqual(['u1', 'Pets', 'Animais'])
    expect(reg.categories).toContain('Animais')
    expect(reg.categories).not.toContain('Pets')
  })

  it('excluir uma categoria em uso pede para onde mover (padrão: Outros) e só então apaga', async () => {
    renderAt('/cadastros/categorias')
    fireEvent.click(within(row('Pets')).getByRole('button', { name: 'Excluir' }))
    expect(screen.getByText('Excluir “Pets”?')).toBeTruthy()
    const select = screen.getByLabelText(/passa(m)? para/) as HTMLSelectElement
    expect(select.value).toBe('Outros')
    expect(within(select).queryByText('Pets')).toBeNull()
    expect(store.moveCategory).not.toHaveBeenCalled()
    fireEvent.change(select, { target: { value: 'Saúde' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.moveCategory).toHaveBeenCalledTimes(1))
    const [, from, to, reg] = store.moveCategory.mock.calls[0] as [string, string, string, Registry]
    expect([from, to]).toEqual(['Pets', 'Saúde'])
    expect(reg.categories).not.toContain('Pets')
  })

  it('cancelar a exclusão não mexe em nada', () => {
    renderAt('/cadastros/categorias')
    fireEvent.click(within(row('Pets')).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Excluir “Pets”?')).toBeNull()
    expect(store.moveCategory).not.toHaveBeenCalled()
  })

  it('categoria sem uso também pede confirmação', async () => {
    renderAt('/cadastros/categorias')
    fireEvent.click(within(row('Lazer')).getByRole('button', { name: 'Excluir' }))
    expect(screen.getByText('Nenhuma conta usa esta categoria.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.moveCategory).toHaveBeenCalledTimes(1))
  })

  it('se a gravação falhar, avisa e deixa tentar de novo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    store.moveCategory.mockRejectedValue(new Error('offline'))
    renderAt('/cadastros/categorias')
    fireEvent.click(within(row('Lazer')).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível salvar. Tente de novo.')
    expect(screen.getByText('Excluir “Lazer”?')).toBeTruthy()
  })

  it('enquanto os cadastros não carregam, não deixa editar (para não gravar o padrão por cima)', () => {
    setup(defaultRegistry(), [bill()], false)
    renderAt('/cadastros/categorias')
    expect(screen.getByText('Carregando seus cadastros…')).toBeTruthy()
    expect(screen.queryByLabelText('Nova categoria')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Adicionar' })).toBeNull()
  })
})

describe('Formas de pagamento', () => {
  it('cria, renomeia e mostra o uso', async () => {
    renderAt('/cadastros/pagamentos')
    expect(within(row('PIX')).getByText('Usada em 1 conta')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nova forma de pagamento'), { target: { value: 'Transferência' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    expect(lastSaved().payments.at(-1)).toEqual({ id: 'p_transferencia', label: 'Transferência' })

    fireEvent.click(within(row('Cartão')).getByRole('button', { name: 'Renomear' }))
    fireEvent.change(screen.getByLabelText('Novo nome'), { target: { value: 'Cartão de crédito' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(2))
    expect(lastSaved().payments.find((p) => p.id === 'cartao')?.label).toBe('Cartão de crédito')
  })

  it('excluir uma forma em uso move as contas para a escolhida', async () => {
    renderAt('/cadastros/pagamentos')
    fireEvent.click(within(row('PIX')).getByRole('button', { name: 'Excluir' }))
    const select = screen.getByLabelText(/passa(m)? para/) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'boleto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.movePayment).toHaveBeenCalledTimes(1))
    const [uid, from, to, reg] = store.movePayment.mock.calls[0] as [string, string, string, Registry]
    expect([uid, from, to]).toEqual(['u1', 'pix', 'boleto'])
    expect(reg.payments.map((p) => p.id)).not.toContain('pix')
  })
})

describe('Fornecedores', () => {
  it('começa vazio, cria, renomeia nas contas e exclui sem apagar contas', async () => {
    renderAt('/cadastros/fornecedores')
    expect(screen.getByText('Nada cadastrado ainda.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Novo fornecedor'), { target: { value: 'Petz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    expect(lastSaved().suppliers).toEqual(['Petz'])
  })

  it('renomear passa o nome novo às contas; excluir só tira da lista', async () => {
    setup({ ...defaultRegistry(), suppliers: ['Petz'] })
    renderAt('/cadastros/fornecedores')
    expect(within(row('Petz')).getByText('Usada em 1 conta')).toBeTruthy()
    fireEvent.click(within(row('Petz')).getByRole('button', { name: 'Renomear' }))
    fireEvent.change(screen.getByLabelText('Novo nome'), { target: { value: 'Petz Brasil' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
    await waitFor(() => expect(store.renameSupplierInBills).toHaveBeenCalledTimes(1))
    const [uid, from, to] = store.renameSupplierInBills.mock.calls[0] as [string, string, string]
    expect([uid, from, to]).toEqual(['u1', 'Petz', 'Petz Brasil'])

    fireEvent.click(within(row('Petz')).getByRole('button', { name: 'Excluir' }))
    expect(screen.getByText(/continua(m)? com este nome escrito/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    expect(lastSaved().suppliers).toEqual([])
  })
})

describe('Atalhos de conta', () => {
  it('lista os atalhos com o que está preenchido e leva ao cadastro de um novo', () => {
    const reg = defaultRegistry()
    reg.templates = [{ ...reg.templates[0], id: 'x1', name: 'Clube', category: 'Lazer', amountCents: 15000, dueDay: 10 }]
    setup(reg)
    renderAt('/cadastros/atalhos')
    const clube = row('Clube')
    expect(within(clube).getByText(/Lazer · Mensal · Boleto · dia 10 · R\$.150,00/)).toBeTruthy()
    expect(within(clube).getByRole('link', { name: 'Editar o atalho Clube' }).getAttribute('href')).toBe('/cadastros/atalhos/x1')
    expect(screen.getByRole('link', { name: 'Novo atalho' }).getAttribute('href')).toBe('/cadastros/atalhos/novo')
  })

  it('exclui um atalho só depois de confirmar e oferece recuperar os padrões que faltam', async () => {
    renderAt('/cadastros/atalhos')
    expect(screen.queryByRole('region', { name: 'Atalhos padrão' })).toBeNull()
    fireEvent.click(within(row('Gás')).getByRole('button', { name: 'Excluir' }))
    expect(store.saveRegistry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    expect(lastSaved().templates.find((t) => t.name === 'Gás')).toBeUndefined()
  })

  it('recuperar os padrões devolve os que faltam, sem duplicar', async () => {
    const reg = defaultRegistry()
    reg.templates = reg.templates.filter((t) => t.name !== 'Gás' && t.name !== 'IPVA')
    setup(reg)
    renderAt('/cadastros/atalhos')
    const box = within(screen.getByRole('region', { name: 'Atalhos padrão' }))
    expect(box.getByText(/Faltam 2 atalhos/)).toBeTruthy()
    fireEvent.click(box.getByRole('button', { name: 'Recuperar atalhos padrão' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    const names = lastSaved().templates.map((t) => t.name)
    expect(names).toContain('Gás')
    expect(names).toContain('IPVA')
    expect(new Set(names).size).toBe(names.length)
  })

  it('cria um atalho com todos os campos e volta para a lista', async () => {
    renderAt('/cadastros/atalhos/novo')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Clube' } })
    fireEvent.change(screen.getByLabelText('Valor (opcional)'), { target: { value: '150,00' } })
    fireEvent.change(screen.getByLabelText('Dia do vencimento (opcional)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Tipo de valor'), { target: { value: 'variable' } })
    fireEvent.change(screen.getByLabelText('Repete'), { target: { value: 'quarterly' } })
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'cartao' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Lazer' } })
    fireEvent.change(screen.getByLabelText('Fornecedor (opcional)'), { target: { value: 'Clube Z' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atalho' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    expect(lastSaved().templates.at(-1)).toMatchObject({
      name: 'Clube',
      amountCents: 15000,
      dueDay: 10,
      valueType: 'variable',
      recurrence: 'quarterly',
      paymentMethod: 'cartao',
      category: 'Lazer',
      supplier: 'Clube Z',
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Atalhos de conta' })).toBeTruthy()
  })

  it('recusa nome repetido, valor e dia inválidos', () => {
    renderAt('/cadastros/atalhos/novo')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'gas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atalho' }))
    expect(screen.getByRole('alert').textContent).toBe('Já existe “gas”.')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outro' } })
    fireEvent.change(screen.getByLabelText('Valor (opcional)'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atalho' }))
    expect(screen.getByRole('alert').textContent).toContain('valor válido')
    fireEvent.change(screen.getByLabelText('Valor (opcional)'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Dia do vencimento (opcional)'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atalho' }))
    expect(screen.getByRole('alert').textContent).toContain('1 a 31')
    expect(store.saveRegistry).not.toHaveBeenCalled()
  })

  it('edita um atalho existente, já preenchido, e o exclui com confirmação', async () => {
    renderAt('/cadastros/atalhos/padrao-ipva')
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('IPVA')
    expect((screen.getByLabelText('Repete') as HTMLSelectElement).value).toBe('yearly')
    fireEvent.change(screen.getByLabelText('Dia do vencimento (opcional)'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar atalho' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(1))
    const names = lastSaved().templates.map((t) => t.name)
    expect(names.filter((n) => n === 'IPVA')).toHaveLength(1)
    expect(lastSaved().templates.find((t) => t.name === 'IPVA')?.dueDay).toBe(15)

    cleanup()
    renderAt('/cadastros/atalhos/padrao-ipva')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir atalho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.saveRegistry).toHaveBeenCalledTimes(2))
    expect(lastSaved().templates.find((t) => t.name === 'IPVA')).toBeUndefined()
  })

  it('atalho que não existe mostra aviso', () => {
    renderAt('/cadastros/atalhos/nao-existe')
    expect(screen.getByText('Atalho não encontrado.')).toBeTruthy()
  })
})

describe('Nova conta usa os cadastros', () => {
  const shortcuts = () => within(screen.getByRole('group', { name: 'Atalhos' }))

  it('mostra os atalhos numa linha rolável e esconde os que já viraram conta', () => {
    setup(defaultRegistry(), [bill({ name: 'Condomínio', category: 'Moradia' })])
    renderAt('/contas/nova')
    const group = screen.getByRole('group', { name: 'Atalhos' })
    expect(group.className).toContain('chips-scroll')
    expect(shortcuts().queryByRole('button', { name: 'Condomínio' })).toBeNull()
    expect(shortcuts().getByRole('button', { name: 'Gás' })).toBeTruthy()
    expect(shortcuts().getByRole('link', { name: 'Meus atalhos' }).getAttribute('href')).toBe('/cadastros/atalhos')
  })

  it('o atalho preenche nome, categoria, forma, repetição, fornecedor, valor e dia', () => {
    const reg = defaultRegistry()
    reg.templates = [
      { id: 'x1', name: 'Clube', category: 'Lazer', amountCents: 15000, dueDay: 10, recurrence: 'yearly', valueType: 'variable', paymentMethod: 'cartao', supplier: 'Clube Z' },
    ]
    setup(reg, [])
    renderAt('/contas/nova')
    fireEvent.click(shortcuts().getByRole('button', { name: 'Clube' }))
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Clube')
    expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Lazer')
    expect((screen.getByLabelText('Forma de pagamento') as HTMLSelectElement).value).toBe('cartao')
    expect((screen.getByLabelText('Repete') as HTMLSelectElement).value).toBe('yearly')
    expect((screen.getByLabelText('Tipo de valor') as HTMLSelectElement).value).toBe('variable')
    expect((screen.getByLabelText('Fornecedor (opcional)') as HTMLInputElement).value).toBe('Clube Z')
    expect((screen.getByLabelText(/Valor/, { selector: 'input' }) as HTMLInputElement).value).toBe('150,00')
    expect((screen.getByLabelText('Dia do vencimento') as HTMLInputElement).value).toBe('10')
  })

  it('atalho sem valor nem dia não apaga o que a pessoa já digitou', () => {
    setup(defaultRegistry(), [])
    renderAt('/contas/nova')
    fireEvent.change(screen.getByLabelText('Dia do vencimento'), { target: { value: '7' } })
    fireEvent.click(shortcuts().getByRole('button', { name: 'Gás' }))
    expect((screen.getByLabelText('Dia do vencimento') as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Contas de consumo')
  })

  it('categorias, formas de pagamento e fornecedores vêm do cadastro da pessoa', () => {
    let reg = defaultRegistry()
    reg = { ...reg, categories: ['Viagens', ...reg.categories], payments: [...reg.payments, { id: 'p_transferencia', label: 'Transferência' }], suppliers: ['Enel'] }
    setup(reg, [bill({ supplier: 'Sabesp' })])
    renderAt('/contas/nova')
    const categories = within(screen.getByLabelText('Categoria')).getAllByRole('option').map((o) => o.textContent)
    expect(categories[0]).toBe('Viagens')
    expect(categories).toContain('Lazer')
    const payments = within(screen.getByLabelText('Forma de pagamento')).getAllByRole('option').map((o) => o.textContent)
    expect(payments).toEqual(['Boleto', 'Débito automático', 'PIX', 'Cartão', 'Transferência'])
    const options = Array.from(document.querySelectorAll('#bill-suppliers option')).map((o) => o.getAttribute('value'))
    expect(options).toEqual(['Enel', 'Sabesp'])
  })

  it('ao editar, não mostra atalhos e mantém a categoria e a forma da conta mesmo que tenham saído da lista', () => {
    setup(defaultRegistry(), [bill({ id: 'b9', category: 'Antiga', paymentMethod: 'p_antiga' })])
    renderAt('/contas/b9')
    expect(screen.queryByRole('group', { name: 'Atalhos' })).toBeNull()
    expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Antiga')
    expect((screen.getByLabelText('Forma de pagamento') as HTMLSelectElement).value).toBe('p_antiga')
  })

  it('a lista de contas mostra o nome atual da forma de pagamento', () => {
    const reg = defaultRegistry()
    reg.payments = reg.payments.map((p) => (p.id === 'pix' ? { ...p, label: 'Pix instantâneo' } : p))
    setup(reg)
    renderAt('/contas')
    expect(screen.getByText(/Pix instantâneo/)).toBeTruthy()
  })
})

describe('Sobre', () => {
  it('guarda a lista completa de funcionalidades, sempre a mesma do app', () => {
    renderAt('/sobre')
    expect(screen.getByRole('heading', { level: 1, name: 'Sobre' })).toBeTruthy()
    const box = within(screen.getByRole('region', { name: 'Funcionalidades do Contas em Dia' }))
    expect(FEATURES.length).toBeGreaterThanOrEqual(10)
    for (const f of FEATURES) expect(box.getByText(f.title)).toBeTruthy()
    expect(box.getByText('Do seu jeito')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Instalar no celular' })).toBeTruthy()
  })
})
