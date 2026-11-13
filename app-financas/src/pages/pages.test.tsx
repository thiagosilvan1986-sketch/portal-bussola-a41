// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultRegistry } from '../domain/registry'
import { buildEntry } from '../domain/bills'
import { dismissWelcome, isWelcomeDismissed } from '../data/welcome'
import { buildInstallments } from '../domain/receivables'
import type { Bill, Entry, Receivable } from '../domain/types'

const TODAY = '2026-11-09'
const flat = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ')

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
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useRegistry: vi.fn(),
  useToday: vi.fn(),
  useAlertSettings: vi.fn(() => ({ data: { enabled: true, days: [1], hour: 8 }, ready: true, error: null })),
  usePushDevices: vi.fn(() => ({ data: [], ready: true, error: null })),
  useEntriesRange: vi.fn(() => ({ data: [], ready: true, error: null })),
}))
const store = vi.hoisted(() => ({
  ensureEntries: vi.fn(),
  payEntry: vi.fn(),
  saveBill: vi.fn(),
  undoPayment: vi.fn(),
  setInstallmentPayment: vi.fn(),
  updateEntryDetails: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)

import BillForm from './BillForm'
import Home from './Home'

beforeEach(() => {
  dismissWelcome() // os testes do Início não querem a apresentação na frente
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useRegistry.mockReturnValue({ data: defaultRegistry(), ready: true, error: null })
  hooks.useBills.mockReturnValue({ data: [bill()], ready: true, error: null })
  hooks.useEntries.mockReturnValue({ data: entries, ready: true, error: null })
  hooks.useReceivables.mockReturnValue({ data: [], ready: true, error: null })
  hooks.usePeople.mockReturnValue({ data: [], ready: true, error: null })
  store.ensureEntries.mockResolvedValue(0)
  store.payEntry.mockResolvedValue(undefined)
  store.saveBill.mockResolvedValue('new-id')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.removeItem('contas-em-dia:escolha:inicio-lado')
  window.localStorage.removeItem('contas-em-dia:escolha:inicio-situacao')
})

const text = (el: Element | null) => (el?.textContent ?? '').replace(/ /g, ' ')

describe('Apresentação na tela inicial', () => {
  const resetWelcome = () => window.localStorage.removeItem('contas-em-dia:apresentacao-vista')
  const renderHome = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    )

  it('aparece na primeira entrada, resume as funcionalidades e some ao tocar em Começar', () => {
    resetWelcome()
    renderHome()
    const card = screen.getByRole('region', { name: 'Apresentação do Contas em Dia' })
    expect(within(card).getByRole('heading', { name: 'Planeje. Controle. Realize.' })).toBeTruthy()
    for (const t of [
      'Nenhuma conta esquecida',
      'Pago em um toque',
      'Quem te deve, na ponta do lápis',
      'Cobrança sem climão',
      'Dashboards interativos para tomada de decisões',
      'Sua planilha, sem retrabalho',
      'Privacidade num toque',
      'Você no controle',
      'Do seu jeito',
      'Tudo à vista, logo na entrada',
    ]) {
      expect(within(card).getByText(t)).toBeTruthy()
    }
    expect(within(card).getByText(/aba Sobre/)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Começar' }))
    expect(screen.queryByRole('region', { name: 'Apresentação do Contas em Dia' })).toBeNull()
    expect(isWelcomeDismissed()).toBe(true)
  })

  it('aparece uma única vez: já na primeira exibição fica registrado, mesmo sem tocar em Começar', () => {
    resetWelcome()
    const first = renderHome()
    expect(screen.getByRole('region', { name: 'Apresentação do Contas em Dia' })).toBeTruthy()
    expect(isWelcomeDismissed()).toBe(true)
    first.unmount()
    renderHome()
    expect(screen.queryByRole('region', { name: 'Apresentação do Contas em Dia' })).toBeNull()
  })

  it('depois de vista, não volta a aparecer ao abrir o app de novo', () => {
    dismissWelcome()
    renderHome()
    expect(screen.queryByRole('region', { name: 'Apresentação do Contas em Dia' })).toBeNull()
  })
})

describe('Início', () => {
  const renderHome = () =>
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

  describe('toda a movimentação do mês', () => {
    const ana = { id: 'p1', name: 'Ana Souza', phone: '', email: '', charges: [] }
    // Tênis: 3 × R$ 100,00 a partir de 15/10; a de novembro vence no dia 15
    const tenis: Receivable = {
      id: 'r1', personId: 'p1', kind: 'cartao', description: 'Tênis', totalCents: 30000, installmentCount: 3,
      firstDueDate: '2026-10-15', installments: buildInstallments(30000, 3, '2026-10-15'), notes: '',
    }
    beforeEach(() => {
      hooks.usePeople.mockReturnValue({ data: [ana], ready: true, error: null })
      hooks.useReceivables.mockReturnValue({ data: [tenis], ready: true, error: null })
      store.setInstallmentPayment.mockResolvedValue(undefined)
    })
    const rows = () => Array.from(document.querySelectorAll('ul.list > li .row-title')).map((t) => t.textContent)

    it('abre em Tudo: contas e parcelas a receber do mês juntas, em ordem alfabética, e o resumo com o saldo', () => {
      renderHome()
      const sides = screen.getByRole('group', { name: 'O que mostrar' })
      expect(within(sides).getByRole('button', { name: 'Tudo' }).getAttribute('aria-pressed')).toBe('true')
      expect(rows()).toEqual(['Ana Souza · Tênis 2/3', 'Condomínio', 'Energia', 'Internet'])
      const t = text(screen.getByLabelText('Resumo do mês'))
      expect(t).toContain('Falta pagar')
      expect(t).toContain('Falta receber')
      expect(t).toContain('R$ 100,00')
      // entra 100,00; sai 829,90: falta 729,90
      expect(t).toContain('Saldo do mês')
      expect(t).toContain('▼ Saldo do mês')
      expect(t).toContain('R$ 729,90')
      expect(t).toContain('Falta: sai mais do que entra')
    })

    it('A receber mostra só as parcelas, com resumo próprio; a escolha fica guardada', () => {
      renderHome()
      fireEvent.click(within(screen.getByRole('group', { name: 'O que mostrar' })).getByRole('button', { name: 'A receber' }))
      expect(rows()).toEqual(['Ana Souza · Tênis 2/3'])
      expect(text(screen.getByLabelText('Resumo do mês'))).toContain('1 parcela pendente')
      expect(screen.queryByLabelText('Categoria')).toBeNull()
      expect(window.localStorage.getItem('contas-em-dia:escolha:inicio-lado')).toBe('receber')
    })

    it('filtra pela situação e pela categoria', () => {
      renderHome()
      fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'atrasadas' } })
      expect(rows()).toEqual(['Energia'])
      fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'quitadas' } })
      expect(rows()).toEqual(['Condomínio'])
      fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'todas' } })
      fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Contas de consumo' } })
      expect(rows()).toEqual(['Condomínio', 'Energia', 'Internet'])
    })

    it('tocar na parcela abre o detalhe para dar baixa; o botão Recebi dá baixa direto', () => {
      renderHome()
      fireEvent.click(screen.getByRole('button', { name: 'Recebi Ana Souza · Tênis 2/3' }))
      expect(store.setInstallmentPayment.mock.calls[0].slice(2)).toEqual([2, { paidAt: TODAY, paidAmountCents: 10000 }])
      fireEvent.click(screen.getByText('Ana Souza · Tênis 2/3'))
      const sheet = screen.getByRole('dialog', { name: 'Ana Souza · Tênis' })
      expect(within(sheet).getByRole('button', { name: 'Marcar como recebida' })).toBeTruthy()
      expect(within(sheet).getByRole('link', { name: 'Ver pessoa e compra' }).getAttribute('href')).toBe('/receber/pessoa/p1')
    })
  })

  it('mostra o resumo do mês e o aviso de atrasada', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('novembro de 2026')

    // Em "A pagar": pendentes Energia 200,00 (atrasada) + Internet 129,90 = 329,90; pago 500,00; total 829,90
    fireEvent.click(within(screen.getByRole('group', { name: 'O que mostrar' })).getByRole('button', { name: 'A pagar' }))
    const t = text(screen.getByLabelText('Resumo do mês'))
    expect(t).toContain('R$ 329,90')
    expect(t).toContain('R$ 500,00')
    expect(t).toContain('R$ 829,90')
    expect(t).toContain('2 contas pendentes')

    expect(screen.getByRole('status').textContent).toContain('1 conta atrasada')
  })

  it('avisa no início quando alguém está com parcela atrasada, por tipo, e leva à lista certa', () => {
    const recv = (id: string, kind: Receivable['kind'], description: string): Receivable => ({
      id,
      personId: 'p1',
      kind,
      description,
      totalCents: 30000,
      installmentCount: 3,
      firstDueDate: '2026-10-01',
      installments: buildInstallments(30000, 3, '2026-10-01'),
      notes: '',
    })
    // parcelas de 01/10 e 01/11 venceram (2 atrasadas de R$ 100,00)
    hooks.useReceivables.mockReturnValue({ data: [recv('r1', 'cartao', 'Tênis'), recv('r2', 'servico', 'Pintura')], ready: true, error: null })
    renderHome()
    const cartao = screen.getByRole('link', { name: /Reembolso do cartão/ })
    expect(text(cartao)).toContain('2 parcelas, R$ 200,00')
    expect(cartao.getAttribute('href')).toBe('/receber')
    const servico = screen.getByRole('link', { name: /Serviço prestado/ })
    expect(servico.getAttribute('href')).toBe('/receber?aba=servicos')
  })

  it('sem atraso a receber, não mostra o aviso', () => {
    renderHome()
    expect(screen.queryByText(/A receber em atraso/)).toBeNull()
  })

  it('lista por vencimento e mostra o status em texto', () => {
    renderHome()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.row-title')?.textContent)).toEqual(['Condomínio', 'Energia', 'Internet'])
    expect(within(rows[0]).getByText('Paga')).toBeTruthy()
    expect(within(rows[1]).getByText('Atrasada')).toBeTruthy()
    expect(within(rows[2]).getByText('Prevista')).toBeTruthy()
  })

  it('conta parcelada mostra "Parcela N de M" junto do vencimento', () => {
    const financiamento = bill({ id: 'b9', name: 'Financiamento', dueDay: 20, startMonth: '2026-09', installmentCount: 10 })
    hooks.useEntries.mockReturnValue({ data: [buildEntry(financiamento, '2026-11'), ...entries], ready: true, error: null })
    renderHome()
    const row = screen.getAllByRole('listitem').find((r) => r.querySelector('.row-title')?.textContent === 'Financiamento')!
    expect(within(row).getByText(/Vence 20\/11\/2026 · Parcela 3 de 10/)).toBeTruthy()
    // conta sem fim não tem rótulo
    const energia = screen.getAllByRole('listitem').find((r) => r.querySelector('.row-title')?.textContent === 'Energia')!
    expect(within(energia).queryByText(/Parcela/)).toBeNull()
  })

  it('a folha da conta mostra o que as pessoas devolvem por ela e o gasto real', () => {
    const fatura = bill({ id: 'b8', name: 'Cartão Nubank', dueDay: 10, expectedAmountCents: 100000 })
    const ana = { id: 'p1', name: 'Ana', phone: '', email: '', charges: [] }
    const reembolso = {
      id: 'r1',
      personId: 'p1',
      kind: 'cartao' as const,
      description: 'Tênis',
      totalCents: 50000,
      installmentCount: 1,
      firstDueDate: '2026-11-10',
      installments: buildInstallments(50000, 1, '2026-11-10'),
      notes: '',
      billId: 'b8',
    }
    hooks.useEntries.mockReturnValue({ data: [buildEntry(fatura, '2026-11')], ready: true, error: null })
    hooks.useReceivables.mockReturnValue({ data: [reembolso], ready: true, error: null })
    hooks.usePeople.mockReturnValue({ data: [ana], ready: true, error: null })
    renderHome()
    fireEvent.click(screen.getByText('Cartão Nubank'))
    const sheet = within(screen.getByRole('dialog'))
    expect(flat(sheet.getByText(/A receber \(Ana\)/).parentElement!.textContent)).toContain('R$ 500,00')
    expect(flat(sheet.getByText('Seu gasto real').parentElement!.textContent)).toContain('R$ 500,00')
    expect(sheet.getByText(/R\$.500,00 ainda não recebidos/)).toBeTruthy()
  })

  it('o botão de check paga o valor a pagar com a data de hoje', () => {
    renderHome()
    fireEvent.click(screen.getByLabelText('Paguei Energia'))
    expect(store.payEntry).toHaveBeenCalledWith('u1', 'b1_2026-11', 20000, TODAY)
    // conta já paga não tem botão
    expect(screen.queryByLabelText('Paguei Condomínio')).toBeNull()
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
    const voltar = screen.getByRole('button', { name: /Voltar para o mês atual/ })
    expect(voltar.className).toContain('back-pill') // botão de verdade, não só texto
    fireEvent.click(voltar)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('novembro de 2026')
    expect(screen.queryByRole('button', { name: /Voltar para o mês atual/ })).toBeNull()
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

  it('o dia do vencimento é uma lista de 1 a 31, sem digitar', () => {
    renderForm()
    const select = screen.getByLabelText('Dia do vencimento') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.required).toBe(true)
    const options = Array.from(select.options)
    expect(options[0].textContent).toBe('Escolha o dia')
    expect(options.slice(1).map((o) => o.value)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)))
    fill('Dia do vencimento', '31')
    expect(select.value).toBe('31')
  })

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
    ['dia não escolhido', { Nome: 'X', valor: '10', dia: '' }, 'Escolha o dia do vencimento.'],
  ])('rejeita %s', (_nome, v, mensagem) => {
    renderForm()
    fill('Nome', v.Nome)
    fill(/Valor/, v.valor)
    fill('Dia do vencimento', v.dia)
    submit()
    expect(screen.getByRole('alert').textContent).toContain(mensagem)
    expect(store.saveBill).not.toHaveBeenCalled()
  })

  it('o nome de uma conta que já existe escolhe a categoria sozinho, até a pessoa mexer nela', () => {
    hooks.useBills.mockReturnValue({ data: [bill({ id: 'b9', name: 'Internet', category: 'Moradia' })], ready: true, error: null })
    renderForm()
    const categoria = () => (screen.getByLabelText('Categoria') as HTMLSelectElement).value
    expect(categoria()).toBe('Outros')
    fill('Nome', 'internet') // sem ligar para caixa
    expect(categoria()).toBe('Moradia')
    expect(screen.getByText(/Categoria sugerida pelo nome/)).toBeTruthy()
    fill('Categoria', 'Lazer') // mexeu na mão: o app para de sugerir
    expect(screen.queryByText(/Categoria sugerida pelo nome/)).toBeNull()
    fill('Nome', 'Internet')
    expect(categoria()).toBe('Lazer')
  })

  it('o nome de um atalho também sugere a categoria, e um nome desconhecido não mexe nela', () => {
    hooks.useBills.mockReturnValue({ data: [], ready: true, error: null })
    renderForm()
    fill('Nome', 'Energia elétrica')
    expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Contas de consumo')
    fill('Nome', 'Coisa que não existe')
    expect((screen.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Contas de consumo')
    expect(screen.queryByText(/Categoria sugerida pelo nome/)).toBeNull()
  })

  it('o valor leva a vírgula na máscara: só números, e 9606 vira 96,06', async () => {
    renderForm()
    const valor = screen.getByLabelText(/Valor/) as HTMLInputElement
    fill(/Valor/, '9606')
    expect(valor.value).toBe('96,06')
    fill(/Valor/, '123456')
    expect(valor.value).toBe('1.234,56')
    fill('Nome', 'Internet')
    fill('Dia do vencimento', '10')
    submit()
    await waitFor(() => expect(store.saveBill).toHaveBeenCalled())
    expect(store.saveBill.mock.calls[0][1]).toMatchObject({ expectedAmountCents: 123456 })
  })

  describe('parcelas', () => {
    const fillBasics = () => {
      fill('Nome', 'Financiamento')
      fill(/Valor/, '98000')
      fill('Dia do vencimento', '10')
    }
    const fim = () => (screen.getByLabelText(/Termina em/) as HTMLInputElement).value

    it('o número de parcelas e o começo calculam o fim, e o fim calcula o número de parcelas', () => {
      renderForm()
      fill('Começa em', '2026-09')
      fill(/Número de parcelas/, '10')
      expect(fim()).toBe('2027-06')
      fill(/Termina em/, '2027-12')
      expect((screen.getByLabelText(/Número de parcelas/) as HTMLInputElement).value).toBe('16')
      fill(/Número de parcelas/, '')
      fill(/Termina em/, '')
      expect(fim()).toBe('')
    })

    it('respeita a repetição: o fim que não cai numa parcela vale a última antes dele', () => {
      renderForm()
      fill('Começa em', '2026-09')
      fill('Repete', 'quarterly')
      fill(/Termina em/, '2027-07')
      expect((screen.getByLabelText(/Número de parcelas/) as HTMLInputElement).value).toBe('4')
      expect(fim()).toBe('2027-06')
      expect(screen.getByText(/a última parcela cai em junho de 2027/)).toBeTruthy()
    })

    it('fim antes do começo não vale: avisa e não salva', () => {
      renderForm()
      fillBasics()
      fill('Começa em', '2026-09')
      fill(/Termina em/, '2026-03')
      expect(screen.getByText(/não pode ser antes do mês em que ela começa/)).toBeTruthy()
      submit()
      expect(store.saveBill).not.toHaveBeenCalled()
    })

    it('conta que já está em andamento: pede as parcelas já pagas e avisa das atrasadas', async () => {
      renderForm()
      fillBasics()
      fill('Começa em', '2026-07') // hoje é novembro: jul, ago, set, out, nov já venceram
      expect(screen.queryByLabelText('Parcelas já pagas')).toBeNull()
      fill(/Número de parcelas/, '10')
      const pagas = screen.getByLabelText('Parcelas já pagas') as HTMLInputElement
      expect(pagas.value).toBe('0')
      expect(screen.getByText(/Se a conta já está em andamento, informe quantas parcelas você já pagou/)).toBeTruthy()
      expect(screen.getByText(/4 parcelas já venceram e não foram pagas/)).toBeTruthy()
      fill('Parcelas já pagas', '3')
      expect(screen.getByText(/1 parcela já venceu e não foi paga/)).toBeTruthy()
      fill('Parcelas já pagas', '99') // passa do que já venceu: fica no máximo
      expect(pagas.value).toBe('5')
      fill('Parcelas já pagas', '3')
      submit()
      await waitFor(() => expect(store.saveBill).toHaveBeenCalled())
      const [, input, , opts] = store.saveBill.mock.calls[0]
      expect(input).toMatchObject({ startMonth: '2026-07', installmentCount: 10 })
      expect(opts).toEqual({ paidInstallments: 3 })
    })

    it('sem número de parcelas a conta não tem fim', async () => {
      renderForm()
      fillBasics()
      submit()
      await waitFor(() => expect(store.saveBill).toHaveBeenCalled())
      expect(store.saveBill.mock.calls[0][1]).toMatchObject({ installmentCount: null })
      expect(store.saveBill.mock.calls[0][3]).toEqual({ paidInstallments: 0 })
    })

    it('número de parcelas fora do limite é recusado', () => {
      renderForm()
      fillBasics()
      fill(/Número de parcelas/, '0')
      submit()
      expect(screen.getByRole('alert').textContent).toContain('de 1 a 360')
      expect(store.saveBill).not.toHaveBeenCalled()
    })
  })

  it('o Cancelar é um botão do mesmo estilo do Salvar, com o ✕, e volta para a lista', () => {
    renderForm()
    const cancelar = screen.getByRole('link', { name: 'Cancelar' })
    expect(cancelar.className).toContain('btn primary')
    expect(cancelar.textContent).toContain('✕')
    expect(cancelar.getAttribute('href')).toBe('/contas')
  })

  it('o atalho com número de parcelas já traz as parcelas e o fim', () => {
    const reg = defaultRegistry()
    reg.templates = [{ ...reg.templates[0], id: 'moto', name: 'Moto', installmentCount: 12 }]
    hooks.useRegistry.mockReturnValue({ data: reg, ready: true, error: null })
    hooks.useBills.mockReturnValue({ data: [], ready: true, error: null })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Moto' }))
    expect((screen.getByLabelText(/Número de parcelas/) as HTMLInputElement).value).toBe('12')
    expect((screen.getByLabelText(/Termina em/) as HTMLInputElement).value).toBe('2027-10')
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
    expect(screen.queryByLabelText('Paguei Água')).toBeNull()
  })
})
