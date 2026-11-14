// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { defaultRegistry } from '../domain/registry'
import { extendRecurring } from '../domain/receivables'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildInstallments, withPayment } from '../domain/receivables'
import type { Bill, Person, Receivable } from '../domain/types'

const TODAY = '2026-11-09'
const flat = (s: string | null) => (s ?? '').replace(/ /g, ' ')

const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '11987654321', email: 'ana@exemplo.com', charges: [] }
const bruno: Person = { id: 'p2', name: 'Bruno Lima', phone: '', email: '', charges: [] }

const instalacao = (): Receivable => ({
  id: 'r2',
  personId: 'p1',
  kind: 'servico',
  description: 'Instalação',
  totalCents: 30000,
  installmentCount: 3,
  firstDueDate: '2026-11-01',
  installments: buildInstallments(30000, 3, '2026-11-01'),
  notes: '',
})

const tenis = (): Receivable => ({
  id: 'r1',
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 42000,
  installmentCount: 10,
  firstDueDate: '2026-09-05',
  installments: withPayment(buildInstallments(42000, 10, '2026-09-05'), 1, { paidAt: '2026-09-05', paidAmountCents: 4200 }),
  notes: '',
})

const hooks = vi.hoisted(() => ({ useBills: vi.fn(), usePeople: vi.fn(), useReceivables: vi.fn(), useToday: vi.fn(), useRegistry: vi.fn() }))
const store = vi.hoisted(() => ({
  createReceivable: vi.fn(),
  updateReceivable: vi.fn(),
  setInstallmentPayment: vi.fn(),
  updatePerson: vi.fn(),
  logCharge: vi.fn(),
  deleteReceivable: vi.fn(),
  deletePerson: vi.fn(),
  deleteChargeLog: vi.fn(),
  setInstallmentAmount: vi.fn(() => Promise.resolve()),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
hooks.useRegistry.mockReturnValue({ data: defaultRegistry(), ready: true, error: null })
vi.mock('../data/store', () => store)

import PersonPage from './PersonPage'
import ReceivableForm from './ReceivableForm'
import Receivables from './Receivables'

function setData(people: Person[], receivables: Receivable[]) {
  hooks.usePeople.mockReturnValue({ data: people, ready: true, error: null })
  hooks.useReceivables.mockReturnValue({ data: receivables, ready: true, error: null })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/receber" element={<Receivables />} />
        <Route path="/receber/nova" element={<ReceivableForm />} />
        <Route path="/receber/compra/:id/editar" element={<ReceivableForm />} />
        <Route path="/receber/pessoa/:id" element={<PersonPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // Os testes antigos conferem o total de todas as parcelas: período "Tudo". O padrão (Mês) tem teste próprio.
  window.localStorage.clear()
  window.localStorage.setItem('contas-em-dia:escolha:receber-periodo', 'tudo')
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useBills.mockReturnValue({ data: [], ready: true, error: null })
  setData([ana, bruno], [tenis()])
  store.createReceivable.mockReturnValue({ personId: 'pNovo', receivableId: 'r9', done: Promise.resolve() })
  for (const fn of [store.logCharge, store.updateReceivable, store.setInstallmentPayment, store.updatePerson, store.deleteReceivable, store.deletePerson, store.deleteChargeLog]) {
    fn.mockResolvedValue(undefined)
  }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('lista A receber', () => {
  it('mostra totais, atrasos e as pessoas', () => {
    renderAt('/receber')
    // parcelas 2 (05/10) e 3 (05/11) vencidas; 1 recebida
    expect(flat(screen.getByText(/^Falta receber/).parentElement!.textContent)).toContain('R$ 378,00')
    expect(screen.getByRole('status').textContent).toContain('2 parcelas atrasadas')
    const row = screen.getByRole('link', { name: /Ana Souza/ })
    expect(row.textContent).toContain('2 parcelas atrasadas')
    expect(row.getAttribute('href')).toBe('/receber/pessoa/p1')
    // Bruno não tem nenhuma compra: fica só em Configurações > Contatos.
    expect(screen.queryByRole('link', { name: /Bruno Lima/ })).toBeNull()
  })

  it('mostra o convite quando não há ninguém', () => {
    setData([], [])
    renderAt('/receber')
    expect(screen.getByText('Nenhum reembolso do cartão')).toBeTruthy()
  })

  it('separa reembolso do cartão e serviços em duas listas, cada uma com seus totais', () => {
    setData([ana, bruno], [tenis(), instalacao(), { ...tenis(), id: 'r3', personId: 'p2', description: 'Mochila', installments: buildInstallments(9000, 3, '2026-12-01'), totalCents: 9000, installmentCount: 3 }])
    renderAt('/receber')
    // aba do cartão: Tênis (Ana) + Mochila (Bruno); o serviço da Ana não entra
    expect(flat(screen.getByText(/^Falta receber/).parentElement!.textContent)).toContain('R$ 468,00')
    expect(screen.getByRole('link', { name: /^Cartão/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: /Bruno Lima/ })).toBeTruthy()

    cleanup()
    renderAt('/receber?aba=servicos')
    expect(flat(screen.getByText(/^Falta receber/).parentElement!.textContent)).toContain('R$ 300,00')
    expect(screen.getByRole('link', { name: /^Serviços/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: /Ana Souza/ }).textContent).toContain('1 parcela atrasada')
    expect(screen.queryByRole('link', { name: /Bruno Lima/ })).toBeNull()
  })

  it('a lista de serviços vazia tem convite próprio e abre a compra já como serviço', () => {
    renderAt('/receber?aba=servicos')
    expect(screen.getByText('Nenhum serviço a receber')).toBeTruthy()
    const nova = screen.getAllByRole('link', { name: 'Nova compra' })
    expect(nova.every((a) => a.getAttribute('href') === '/receber/nova?tipo=servico')).toBe(true)
  })

  it('mostra nas abas quantas parcelas estão atrasadas em cada tipo', () => {
    setData([ana], [tenis(), instalacao()])
    renderAt('/receber')
    expect(screen.getByRole('link', { name: /^Cartão\s*2 em atraso/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Serviços\s*1 em atraso/ })).toBeTruthy()
  })
})

describe('nova compra parcelada', () => {
  it('cadastra pessoa nova com telefone e e-mail e gera as parcelas', () => {
    setData([], [])
    renderAt('/receber/nova')
    fireEvent.change(screen.getByLabelText('Nome da pessoa'), { target: { value: 'Carla Dias' } })
    fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '(11) 91234-5678' } })
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'carla@exemplo.com' } })
    fireEvent.change(screen.getByLabelText('O que foi'), { target: { value: 'Geladeira' } })
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: '1000,00' } })
    fireEvent.change(screen.getByLabelText(/Nº de parcelas/), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/Vencimento da 1ª/), { target: { value: '2026-12-10' } })
    expect(flat(document.querySelector('.preview')!.textContent)).toContain('3 parcelas de R$ 333,33 a R$ 333,34')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(store.createReceivable).toHaveBeenCalledOnce()
    const [uid, input] = store.createReceivable.mock.calls[0]
    expect(uid).toBe('u1')
    expect(input.person).toEqual({ name: 'Carla Dias', phone: '11912345678', email: 'carla@exemplo.com', charges: [], tone: 'amigavel' })
    expect(input.receivable).toMatchObject({ kind: 'cartao', description: 'Geladeira', totalCents: 100000, installmentCount: 3, firstDueDate: '2026-12-10' })
    expect(input.receivable.installments.map((i: { amountCents: number }) => i.amountCents)).toEqual([33334, 33333, 33333])
  })

  it('deixa escolher o tom da cobrança da pessoa nova (amigável é o padrão)', () => {
    setData([], [])
    renderAt('/receber/nova')
    expect((screen.getByLabelText('Tom da cobrança') as HTMLSelectElement).value).toBe('amigavel')
    fireEvent.change(screen.getByLabelText('Nome da pessoa'), { target: { value: 'Dr. Paulo' } })
    fireEvent.change(screen.getByLabelText('Tom da cobrança'), { target: { value: 'profissional' } })
    fireEvent.click(screen.getByRole('radio', { name: /Serviço prestado/ }))
    fireEvent.change(screen.getByLabelText('Qual foi o serviço'), { target: { value: 'Consultoria' } })
    fireEvent.change(screen.getByLabelText('Valor por mês (R$)'), { target: { value: '500,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(store.createReceivable.mock.calls[0][1].person).toMatchObject({ name: 'Dr. Paulo', tone: 'profissional' })
  })

  it('cadastra um serviço prestado mensal com número de parcelas, valor fixo, dia e mês de início', () => {
    renderAt('/receber/nova?pessoa=p1')
    expect((screen.getByRole('radio', { name: /Reembolso do cartão/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Serviço prestado/ }))
    fireEvent.change(screen.getByLabelText('Qual foi o serviço'), { target: { value: 'Pintura' } })
    expect((screen.getByLabelText('Tipo de valor') as HTMLSelectElement).value).toBe('fixed')
    fireEvent.change(screen.getByLabelText('Valor por mês (R$)'), { target: { value: '300,00' } })
    fireEvent.change(screen.getByLabelText(/Nº de parcelas/), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Dia do vencimento'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Começa em'), { target: { value: '2026-11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const saved = store.createReceivable.mock.calls[0][1].receivable
    expect(saved).toMatchObject({ kind: 'servico', description: 'Pintura', totalCents: 90000, monthlyCents: 30000, recurring: false, valueType: 'fixed', firstDueDate: '2026-11-10' })
    expect(saved.billId).toBeUndefined()
    expect(saved.installments.map((i: { dueDate: string; amountCents: number }) => [i.dueDate, i.amountCents])).toEqual([
      ['2026-11-10', 30000],
      ['2026-12-10', 30000],
      ['2027-01-10', 30000],
    ])
  })

  it('abre já como serviço quando vem da lista de serviços', () => {
    renderAt('/receber/nova?tipo=servico')
    expect((screen.getByRole('radio', { name: /Serviço prestado/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByLabelText('Qual foi o serviço')).toBeTruthy()
  })

  it('usa uma pessoa já cadastrada e aceita parcelas já recebidas', () => {
    renderAt('/receber/nova?pessoa=p1')
    expect((screen.getByLabelText('Quem vai pagar') as HTMLSelectElement).value).toBe('p1')
    fireEvent.change(screen.getByLabelText('O que foi'), { target: { value: 'Celular' } })
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: '1200,00' } })
    fireEvent.change(screen.getByLabelText(/Nº de parcelas/), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/Vencimento da 1ª/), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Parcelas já recebidas'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    const input = store.createReceivable.mock.calls[0][1]
    expect(input.person.id).toBe('p1')
    expect(input.receivable.installments[0]).toMatchObject({ paidAt: '2026-10-01', paidAmountCents: 10000 })
    expect(input.receivable.installments[1].paidAt).toBeNull()
  })

  it.each([
    ['telefone inválido', { phone: '123' }, 'Telefone inválido'],
    ['e-mail inválido', { email: 'ana@' }, 'E-mail inválido'],
    ['sem nome', { name: '' }, 'Informe o nome da pessoa'],
    ['sem valor', { total: '' }, 'Informe o valor total'],
    ['parcelas demais', { count: '99' }, 'de 1 a 60'],
    ['recebidas demais', { received: '5', count: '3' }, 'de 0 a 2'],
  ])('rejeita %s', (_nome, over, mensagem) => {
    setData([], [])
    renderAt('/receber/nova')
    const v = { name: 'Dani', phone: '', email: '', total: '100,00', count: '2', received: '0', ...over }
    fireEvent.change(screen.getByLabelText('Nome da pessoa'), { target: { value: v.name } })
    fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: v.phone } })
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: v.email } })
    fireEvent.change(screen.getByLabelText('O que foi'), { target: { value: 'Coisa' } })
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: v.total } })
    fireEvent.change(screen.getByLabelText(/Nº de parcelas/), { target: { value: v.count } })
    fireEvent.change(screen.getByLabelText('Parcelas já recebidas'), { target: { value: v.received } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert').textContent).toContain(mensagem)
    expect(store.createReceivable).not.toHaveBeenCalled()
  })
})

describe('previsão por mês na lista', () => {
  it('mostra quanto vence em cada mês, o atrasado de antes e o que vem depois', () => {
    renderAt('/receber')
    const card = document.querySelector('details.forecast') as HTMLElement
    expect(card).toBeTruthy()
    expect(within(card).getByText('Quanto volta por mês')).toBeTruthy()
    expect(flat(card.textContent)).toContain('Este mês: R$ 42,00 a receber')
    expect(flat(card.textContent)).toContain('Atrasado de meses anteriores')
    expect(flat(card.textContent)).toContain('dez/2026')
    const labels = within(card).getAllByRole('img').map((e) => flat(e.getAttribute('aria-label')))
    expect(labels[0]).toBe('nov/2026: R$ 0,00 recebidos de R$ 42,00')
    expect(labels).toHaveLength(6)
  })

  it('na lista de serviços o título é outro e some quando não há nada a receber', () => {
    setData([ana], [instalacao()])
    renderAt('/receber?aba=servicos')
    expect(screen.getByText('Quanto entra por mês')).toBeTruthy()
    cleanup()
    setData([ana], [])
    renderAt('/receber')
    expect(document.querySelector('details.forecast')).toBeNull()
  })
})

describe('histórico de cobranças', () => {
  const cobrada = (): Person => ({
    ...ana,
    charges: [{ date: '2026-11-06', channel: 'whatsapp', totalCents: 8400, overdue: true }],
  })

  it('registra a cobrança ao abrir o WhatsApp, o e-mail ou copiar a mensagem', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar Ana' }))
    const dialog = screen.getByRole('dialog')
    const wa = within(dialog).getByRole('link', { name: 'Enviar pelo WhatsApp' })
    wa.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(wa)
    expect(store.logCharge).toHaveBeenLastCalledWith('u1', expect.objectContaining({ id: 'p1' }), {
      date: TODAY,
      channel: 'whatsapp',
      totalCents: 8400,
      overdue: true,
    })
    const mail = within(dialog).getByRole('link', { name: 'Enviar por e-mail' })
    mail.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(mail)
    expect(store.logCharge).toHaveBeenLastCalledWith('u1', expect.anything(), expect.objectContaining({ channel: 'email' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar mensagem' }))
    await waitFor(() => expect(store.logCharge).toHaveBeenLastCalledWith('u1', expect.anything(), expect.objectContaining({ channel: 'copia' })))
    expect(store.logCharge).toHaveBeenCalledTimes(3)
  })

  it('avisa na folha de cobrança quando já cobrou há pouco tempo', () => {
    setData([{ ...ana, charges: [{ date: '2026-11-08', channel: 'email', totalCents: 8400, overdue: true }] }], [tenis()])
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar Ana' }))
    expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toContain('Você já cobrou Ana ontem por e-mail.')
  })

  it('mostra a última cobrança e o histórico na página da pessoa e na lista', () => {
    setData([cobrada()], [tenis()])
    renderAt('/receber/pessoa/p1')
    const hist = document.querySelector('details.charge-history') as HTMLElement
    expect(flat(hist.textContent)).toContain('Última cobrança: há 3 dias por WhatsApp')
    expect(flat(hist.textContent)).toContain('06/11/2026 · WhatsApp')
    expect(flat(hist.textContent)).toContain('R$ 84,00 · em atraso')
    cleanup()
    renderAt('/receber')
    expect(screen.getByRole('link', { name: /Ana Souza/ }).textContent).toContain('Última cobrança: há 3 dias por WhatsApp')
  })

  it('sem cobrança registrada, não mostra histórico', () => {
    renderAt('/receber/pessoa/p1')
    expect(document.querySelector('details.charge-history')).toBeNull()
  })

  it('editar o contato não apaga o histórico', () => {
    setData([cobrada()], [tenis()])
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), { target: { value: '(21) 99876-5432' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(store.updatePerson).toHaveBeenCalledWith('u1', expect.objectContaining({ phone: '21998765432', charges: cobrada().charges }))
  })
})

describe('editar compra', () => {
  it('abre com os dados da compra e salva mantendo as baixas', () => {
    renderAt('/receber/compra/r1/editar')
    expect(screen.getByRole('heading', { level: 1, name: 'Editar reembolso do cartão' })).toBeTruthy()
    expect((screen.getByLabelText('O que foi') as HTMLInputElement).value).toBe('Tênis')
    expect((screen.getByLabelText(/Valor total/) as HTMLInputElement).value).toBe('420,00')
    expect((screen.getByLabelText(/Nº de parcelas/) as HTMLInputElement).value).toBe('10')
    expect(screen.queryByLabelText('Parcelas já recebidas')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /Serviço prestado/ }))
    fireEvent.change(screen.getByLabelText('Qual foi o serviço'), { target: { value: 'Conserto de tênis' } })
    fireEvent.change(screen.getByLabelText(/Nº de parcelas/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(store.createReceivable).not.toHaveBeenCalled()
    expect(store.updateReceivable).toHaveBeenCalledOnce()
    const saved = store.updateReceivable.mock.calls[0][1]
    expect(saved).toMatchObject({ id: 'r1', personId: 'p1', kind: 'servico', description: 'Conserto de tênis', installmentCount: 5, totalCents: 42000 })
    expect(saved.installments).toHaveLength(5)
    // a parcela 1 já tinha baixa e continua com ela
    expect(saved.installments[0]).toMatchObject({ number: 1, paidAt: '2026-09-05', paidAmountCents: 4200 })
  })

  it('não deixa reduzir as parcelas abaixo da última que já teve baixa', () => {
    const r = tenis()
    r.installments = withPayment(r.installments, 4, { paidAt: '2026-10-01', paidAmountCents: 4200 })
    setData([ana], [r])
    renderAt('/receber/compra/r1/editar')
    fireEvent.change(screen.getByLabelText(/Nº de parcelas/), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(screen.getByRole('alert').textContent).toContain('Já existe baixa até a parcela 4')
    expect(store.updateReceivable).not.toHaveBeenCalled()
  })

  it('avisa quando a compra não existe', () => {
    renderAt('/receber/compra/xx/editar')
    expect(screen.getByText('Compra não encontrada.')).toBeTruthy()
  })

  it('o botão Editar da página da pessoa leva ao formulário da compra', () => {
    renderAt('/receber/pessoa/p1')
    expect(screen.getByRole('link', { name: 'Editar compra Tênis' }).getAttribute('href')).toBe('/receber/compra/r1/editar')
  })
})

describe('página da pessoa', () => {
  it('mostra o resumo e quantas parcelas faltam', () => {
    renderAt('/receber/pessoa/p1')
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Souza' })).toBeTruthy()
    expect(flat(screen.getByText(/1 de 10 parcelas recebidas/).textContent)).toContain('faltam R$ 378,00')
    expect(screen.getByText('(11) 98765-4321')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('2 parcelas atrasadas')
  })

  it('dá baixa com um toque na parcela, com a data de hoje e o valor cheio', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Dar baixa na parcela 2 de 10 (Tênis)' }))
    expect(store.setInstallmentPayment).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'r1' }), 2, {
      paidAt: TODAY,
      paidAmountCents: 4200,
    })
  })

  it('dá baixa com outro valor e outra data, e não aceita data futura', () => {
    renderAt('/receber/pessoa/p1')
    const row = screen.getByText('Parcela 3 de 10').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Valor/data' }))
    fireEvent.change(within(row).getByLabelText('Valor recebido'), { target: { value: '30,00' } })
    fireEvent.change(within(row).getByLabelText('Data'), { target: { value: '2026-11-20' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Confirmar' }))
    expect(within(row).getByRole('alert').textContent).toContain('não pode ser futura')
    expect(store.setInstallmentPayment).not.toHaveBeenCalled()
    fireEvent.change(within(row).getByLabelText('Data'), { target: { value: '2026-11-08' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Confirmar' }))
    expect(store.setInstallmentPayment).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'r1' }), 3, {
      paidAt: '2026-11-08',
      paidAmountCents: 3000,
    })
  })

  it('desfaz a baixa de uma parcela recebida', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer baixa da parcela 1 de 10 (Tênis)' }))
    expect(store.setInstallmentPayment).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'r1' }), 1, null)
  })

  it('Cobrar abre a mensagem pronta e o link direto do WhatsApp', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar Ana' }))
    const dialog = screen.getByRole('dialog', { name: 'Cobrar Ana Souza' })
    const text = (within(dialog).getByRole('textbox') as HTMLTextAreaElement).value
    expect(flat(text)).toContain('Não achei aqui o pagamento das parcelas 2 e 3 de 10 (Tênis), que somam R$ 84,00')
    const wa = within(dialog).getByRole('link', { name: 'Enviar pelo WhatsApp' })
    expect(wa.getAttribute('href')).toBe(`https://wa.me/5511987654321?text=${encodeURIComponent(text)}`)
    const mail = within(dialog).getByRole('link', { name: 'Enviar por e-mail' })
    expect(mail.getAttribute('href')).toContain('mailto:ana@exemplo.com?subject=')
  })

  it('Cobrar sem telefone nem e-mail pede o cadastro do contato', () => {
    setData([bruno], [{ ...tenis(), personId: 'p2' }])
    renderAt('/receber/pessoa/p2')
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar Bruno' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('link', { name: 'Enviar pelo WhatsApp' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar telefone' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('form', { name: 'Editar contato' })).toBeTruthy()
  })

  it('edita o contato guardando o telefone só com dígitos', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), { target: { value: '(21) 99876-5432' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(store.updatePerson).toHaveBeenCalledWith('u1', { id: 'p1', name: 'Ana Souza', phone: '21998765432', email: 'ana@exemplo.com', charges: [], tone: 'amigavel' })
  })

  it('mostra e altera o tom da cobrança no contato', () => {
    renderAt('/receber/pessoa/p1')
    expect(flat(screen.getByText('Tom da cobrança').parentElement!.textContent)).toContain('Amigável')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    fireEvent.change(screen.getByLabelText('Tom da cobrança'), { target: { value: 'profissional' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(store.updatePerson).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'p1', tone: 'profissional' }))
  })

  it('o formulário de contato abre com o tom já escolhido para a pessoa', () => {
    setData([{ ...ana, tone: 'profissional' }], [tenis()])
    renderAt('/receber/pessoa/p1')
    expect(flat(screen.getByText('Tom da cobrança').parentElement!.textContent)).toContain('Profissional')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    expect((screen.getByLabelText('Tom da cobrança') as HTMLSelectElement).value).toBe('profissional')
  })

  it('a cobrança de quem está no tom profissional sai mais formal', () => {
    setData([{ ...ana, tone: 'profissional' }], [tenis()])
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Cobrar Ana' }))
    const text = (within(screen.getByRole('dialog')).getByRole('textbox') as HTMLTextAreaElement).value
    expect(flat(text)).toContain('Não localizei o pagamento das parcelas 2 e 3 de 10 (Tênis), que somam R$ 84,00')
    expect(flat(text)).not.toContain('😊')
  })

  it('não deixa salvar contato inválido', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'sem-arroba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(screen.getByRole('alert').textContent).toContain('E-mail inválido')
    expect(store.updatePerson).not.toHaveBeenCalled()
  })

  it('quando a pessoa tem os dois tipos, mostra uma seção e uma cobrança para cada', () => {
    setData([ana], [tenis(), instalacao()])
    renderAt('/receber/pessoa/p1')
    const cartao = screen.getByRole('region', { name: 'Reembolso do cartão' })
    const servico = screen.getByRole('region', { name: 'Serviço prestado' })
    expect(within(cartao).getByText('Tênis')).toBeTruthy()
    expect(within(cartao).queryByText('Instalação')).toBeNull()
    expect(flat(within(cartao).getByText(/^Falta receber/).parentElement!.textContent)).toContain('R$ 378,00')
    expect(flat(within(servico).getByText(/^Falta receber/).parentElement!.textContent)).toContain('R$ 300,00')

    fireEvent.click(screen.getByRole('button', { name: 'Cobrar Ana (serviço prestado)' }))
    const text = (within(screen.getByRole('dialog')).getByRole('textbox') as HTMLTextAreaElement).value
    expect(flat(text)).toContain('parcela 1 de 3 do serviço (Instalação), de R$ 100,00')
    expect(flat(text)).not.toContain('Tênis')
  })

  it('o Voltar leva para a lista do tipo da pessoa', () => {
    setData([ana], [instalacao()])
    renderAt('/receber/pessoa/p1')
    expect(screen.getByRole('link', { name: 'Voltar' }).getAttribute('href')).toBe('/receber?aba=servicos')
  })

  it('exclui a compra só depois de confirmar', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir compra' }))
    expect(store.deleteReceivable).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.deleteReceivable).toHaveBeenCalledWith('u1', 'r1')
  })

  it('pessoa sem compras pode ser excluída', () => {
    renderAt('/receber/pessoa/p2')
    expect(screen.queryByRole('button', { name: /Cobrar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pessoa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.deletePerson).toHaveBeenCalledWith('u1', 'p2')
  })

  it('excluir a pessoa leva junto todas as compras dela, só depois de confirmar', () => {
    setData([ana], [tenis(), instalacao()])
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Ana e as compras' }))
    expect(store.deletePerson).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('histórico de cobranças')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.deletePerson).toHaveBeenCalledTimes(1)
    const [uid, personId, receivableIds] = store.deletePerson.mock.calls[0]
    expect(uid).toBe('u1')
    expect(personId).toBe('p1')
    expect([...receivableIds].sort()).toEqual(['r1', 'r2'])
  })

  it('exclui uma cobrança do histórico, pela posição original', () => {
    const log = (date: string) => ({ date, channel: 'whatsapp' as const, totalCents: 4200, overdue: true })
    const comHistorico = { ...ana, charges: [log('2026-10-01'), log('2026-10-20'), log('2026-11-02')] }
    setData([comHistorico], [tenis()])
    renderAt('/receber/pessoa/p1')
    const historico = screen.getByText('Histórico de cobranças').closest('details')!
    const botoes = within(historico).getAllByRole('button', { name: 'Excluir' })
    expect(botoes).toHaveLength(3)
    fireEvent.click(botoes[1]) // a do meio: 20/10
    fireEvent.click(within(historico).getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.deleteChargeLog).toHaveBeenCalledWith('u1', comHistorico, 1)
  })

  it('avisa quando a pessoa não existe', () => {
    renderAt('/receber/pessoa/xx')
    expect(screen.getByText('Pessoa não encontrada.')).toBeTruthy()
  })
})

describe('Copiar e criar novo', () => {
  const fillLabel = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement

  it('na edição da compra, leva ao cadastro novo; ele vem preenchido, sem as baixas, e nada é salvo antes de Salvar', () => {
    renderAt('/receber/compra/r1/editar')
    expect(screen.getByRole('link', { name: 'Copiar e criar novo' }).getAttribute('href')).toBe('/receber/nova?copiarCompra=r1')
    cleanup()

    renderAt('/receber/nova?copiarCompra=r1')
    expect(screen.getByRole('heading', { level: 1, name: /Novo reembolso do cartão em 10x/ })).toBeTruthy()
    expect(fillLabel('O que foi').value).toBe('Tênis (cópia)')
    expect(fillLabel(/Valor total/).value).toBe('420,00')
    expect(fillLabel('Nº de parcelas').value).toBe('10')
    expect(fillLabel('Vencimento da 1ª parcela').value).toBe(TODAY) // a cópia começa hoje
    expect((screen.getByLabelText('Quem vai pagar') as HTMLSelectElement).value).toBe('p1')
    expect(fillLabel('Parcelas já recebidas').value).toBe('0') // a baixa da 1ª parcela não é copiada
    expect(screen.getByText(/As baixas não são copiadas/)).toBeTruthy()
    expect(store.createReceivable).not.toHaveBeenCalled()

    fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }).closest('form')!)
    expect(store.createReceivable).toHaveBeenCalledTimes(1)
    const { person, receivable } = store.createReceivable.mock.calls[0][1]
    expect(person.id).toBe('p1')
    expect(receivable).toMatchObject({ description: 'Tênis (cópia)', totalCents: 42000, installmentCount: 10, firstDueDate: TODAY })
    expect(receivable.installments.every((i: { paidAt: string | null }) => i.paidAt === null)).toBe(true)
  })

  it('na edição do contato, leva ao cadastro de pessoa nova com os dados da pessoa e "(cópia)" no nome', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    expect(screen.getByRole('link', { name: 'Copiar e criar novo' }).getAttribute('href')).toBe('/receber/nova?copiarPessoa=p1')
    cleanup()

    renderAt('/receber/nova?copiarPessoa=p1')
    expect((screen.getByLabelText('Quem vai pagar') as HTMLSelectElement).value).toBe('__new')
    expect(fillLabel('Nome da pessoa').value).toBe('Ana Souza (cópia)')
    expect(fillLabel(/Telefone/).value).toBe('(11) 98765-4321')
    expect(fillLabel(/E-mail/).value).toBe('ana@exemplo.com')
    expect(screen.getByText(/Cópia do contato de “Ana Souza”/)).toBeTruthy()
    expect(store.createReceivable).not.toHaveBeenCalled()
  })
})

describe('Refere-se à conta a pagar', () => {
  const fatura: Bill = {
    id: 'b1',
    name: 'Cartão Nubank',
    category: 'Cartão de crédito',
    supplier: '',
    valueType: 'variable',
    expectedAmountCents: 100000,
    dueDay: 10,
    recurrence: 'monthly',
    startMonth: '2026-01',
    paymentMethod: 'cartao',
    notes: '',
    active: true,
  }
  const energia: Bill = { ...fatura, id: 'b2', name: 'Energia', paymentMethod: 'boleto' }
  const campo = 'Refere-se à conta paga com cartão (opcional)'
  const live = <T,>(data: T[]) => ({ data, ready: true, error: null })

  beforeEach(() => {
    hooks.useBills.mockReturnValue(live([energia, fatura]))
  })

  it('só aparece para reembolso do cartão e quando há contas cadastradas', () => {
    renderAt('/receber/nova?pessoa=p1')
    const select = screen.getByLabelText(campo) as HTMLSelectElement
    // só as contas pagas com cartão de crédito (Energia é boleto)
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Nenhuma', 'Cartão Nubank'])
    fireEvent.click(screen.getByRole('radio', { name: /Serviço prestado/ }))
    expect(screen.queryByLabelText(campo)).toBeNull()
    cleanup()

    hooks.useBills.mockReturnValue(live([]))
    renderAt('/receber/nova?pessoa=p1')
    expect(screen.queryByLabelText(campo)).toBeNull()
  })

  it('ligar a uma conta grava o vínculo; sem escolher, nada é gravado', () => {
    renderAt('/receber/nova?pessoa=p1')
    fireEvent.change(screen.getByLabelText('O que foi'), { target: { value: 'Celular' } })
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: '500,00' } })
    fireEvent.change(screen.getByLabelText(campo), { target: { value: 'b1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(store.createReceivable.mock.calls[0][1].receivable.billId).toBe('b1')
    cleanup()
    vi.clearAllMocks()
    store.createReceivable.mockReturnValue({ personId: 'p1', receivableId: 'r9', done: Promise.resolve() })

    renderAt('/receber/nova?pessoa=p1')
    fireEvent.change(screen.getByLabelText('O que foi'), { target: { value: 'Celular' } })
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: '500,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(store.createReceivable.mock.calls[0][1].receivable).not.toHaveProperty('billId')
  })

  it('na edição mostra a conta ligada, permite trocar ou tirar a ligação, e a página da pessoa mostra a conta', () => {
    const ligada = { ...tenis(), billId: 'b1' }
    setData([ana, bruno], [ligada])
    renderAt('/receber/pessoa/p1')
    expect(screen.getByText('Refere-se à conta a pagar: Cartão Nubank')).toBeTruthy()
    cleanup()

    renderAt('/receber/compra/r1/editar')
    const select = screen.getByLabelText(campo) as HTMLSelectElement
    expect(select.value).toBe('b1')
    fireEvent.change(select, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(store.updateReceivable.mock.calls[0][1].billId).toBeNull()
  })

  it('a cópia da compra mantém a ligação', () => {
    setData([ana, bruno], [{ ...tenis(), billId: 'b2' }])
    renderAt('/receber/nova?copiarCompra=r1')
    expect((screen.getByLabelText(campo) as HTMLSelectElement).value).toBe('b2')
  })
})

describe('Contato da agenda', () => {
  const vcf = (text: string) => new File([text], 'contato.vcf', { type: 'text/vcard' })
  const cartao = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ana Maria Souza\nTEL;type=CELL:+55 11 98765-4321\nEMAIL:ana.maria@exemplo.com\nEND:VCARD'
  const upload = (text: string) =>
    fireEvent.change(screen.getByLabelText('Arquivo de contato (.vcf)'), { target: { files: [vcf(text)] } })
  const field = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement

  it('pessoa nova: importar um arquivo .vcf preenche nome, telefone e e-mail, com o passo a passo na tela', async () => {
    setData([], [])
    renderAt('/receber/nova')
    expect(screen.queryByRole('button', { name: 'Escolher da agenda do celular' })).toBeNull()
    expect(screen.getByText('Como importar da agenda do celular')).toBeTruthy()
    expect(screen.getByText(/escolha Arquivo vCard \(\.vcf\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Importar contato (.vcf)' })).toBeTruthy()

    upload(cartao)
    await waitFor(() => expect(field('Nome da pessoa').value).toBe('Ana Maria Souza'))
    expect(field(/Telefone/).value).toBe('(11) 98765-4321')
    expect(field(/E-mail/).value).toBe('ana.maria@exemplo.com')
    expect(screen.getByRole('status').textContent).toContain('Confira os dados antes de salvar')
    // digitar continua valendo
    fireEvent.change(field('Nome da pessoa'), { target: { value: 'Ana' } })
    expect(field('Nome da pessoa').value).toBe('Ana')
  })

  it('arquivo sem contato mostra o aviso e não mexe nos campos', async () => {
    setData([], [])
    renderAt('/receber/nova')
    fireEvent.change(field('Nome da pessoa'), { target: { value: 'Dani' } })
    upload('isto não é um contato')
    expect((await screen.findByRole('alert')).textContent).toContain('Não encontrei nenhum contato')
    expect(field('Nome da pessoa').value).toBe('Dani')
  })

  it('arquivo com vários contatos usa o primeiro e avisa', async () => {
    setData([], [])
    renderAt('/receber/nova')
    upload(`${cartao}\nBEGIN:VCARD\nFN:Bruno\nEND:VCARD`)
    await waitFor(() => expect(field('Nome da pessoa').value).toBe('Ana Maria Souza'))
    expect(screen.getByRole('status').textContent).toContain('O arquivo tem 2 contatos; usei o primeiro')
  })

  it('na edição do contato da pessoa também dá para importar', async () => {
    renderAt('/receber/pessoa/p2')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    upload(cartao)
    await waitFor(() => expect(field('Nome').value).toBe('Ana Maria Souza'))
    expect(field(/Telefone/).value).toBe('(11) 98765-4321')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(store.updatePerson).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'p2', name: 'Ana Maria Souza', phone: '11987654321', email: 'ana.maria@exemplo.com' }))
  })
})

describe('Rateio de conta', () => {
  const aluguel: Bill = {
    id: 'b1', name: 'Aluguel', category: 'Moradia', supplier: '', valueType: 'fixed', expectedAmountCents: 190800, dueDay: 10,
    recurrence: 'monthly', startMonth: '2026-01', paymentMethod: 'pix', notes: '', active: true,
  }
  const live = <T,>(data: T[]) => ({ data, ready: true, error: null })
  beforeEach(() => hooks.useBills.mockReturnValue(live([aluguel])))

  it('tem aba própria na lista A receber, com o convite e o botão Novo rateio', () => {
    setData([ana], [])
    renderAt('/receber?aba=rateios')
    expect(screen.getByRole('link', { name: 'Rateios' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Nenhum rateio de conta')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Novo rateio' })[0].getAttribute('href')).toBe('/receber/nova?tipo=rateio')
  })

  it('sem número de parcelas, grava um rateio sem fim ligado à conta, no dia dela', () => {
    renderAt('/receber/nova?pessoa=p1&tipo=rateio')
    expect(screen.getByRole('radio', { name: /Rateio de conta/ })).toHaveProperty('checked', true)
    // conta é obrigatória
    fireEvent.change(screen.getByLabelText(/Parte da pessoa por mês/), { target: { value: '954,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert').textContent).toBe('Escolha a conta a pagar deste rateio.')
    fireEvent.change(screen.getByLabelText('Conta a pagar dividida'), { target: { value: 'b1' } })
    expect(screen.getByText(/Vence todo dia 10, junto com a conta/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Começa em'), { target: { value: '2026-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const saved = store.createReceivable.mock.calls[0][1].receivable
    expect(saved).toMatchObject({ kind: 'rateio', description: 'Aluguel', billId: 'b1', recurring: true, monthlyCents: 95400, endMonth: null, firstDueDate: '2026-10-10' })
    // de outubro até o mês que vem (hoje é 09/11)
    expect(saved.installments.map((i: { dueDate: string }) => i.dueDate)).toEqual(['2026-10-10', '2026-11-10', '2026-12-10'])
    expect(saved).not.toHaveProperty('paymentMethod')
  })

  it('com número de parcelas, grava valor × parcelas', () => {
    renderAt('/receber/nova?pessoa=p1&tipo=rateio')
    fireEvent.change(screen.getByLabelText('Conta a pagar dividida'), { target: { value: 'b1' } })
    fireEvent.change(screen.getByLabelText(/Parte da pessoa por mês/), { target: { value: '100,00' } })
    fireEvent.change(screen.getByLabelText(/Nº de parcelas/), { target: { value: '6' } })
    expect(screen.getByText(/6 × R\$.100,00, uma por mês/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Novo rateio de conta em 6x' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const saved = store.createReceivable.mock.calls[0][1].receivable
    expect(saved).toMatchObject({ recurring: false, installmentCount: 6, totalCents: 60000 })
  })

  it('na pessoa, o rateio sem fim mostra o valor por mês e cada parte pelo mês; editar permite encerrar', () => {
    const r: Receivable = {
      id: 'r5', personId: 'p1', kind: 'rateio', description: 'Parte da Ana no aluguel', totalCents: 0, installmentCount: 0,
      firstDueDate: '2026-10-10', installments: [], notes: '', billId: 'b1', recurring: true, monthlyCents: 95400, endMonth: null,
    }
    // o app completa os meses ao ler (aqui, o teste entrega já completo, como o hook faz)
    setData([ana], [extendRecurring(r, '2026-12')])
    renderAt('/receber/pessoa/p1')
    const card = screen.getByRole('region', { name: 'Parte da Ana no aluguel' })
    expect(flat(card.textContent)).toContain('Todo mês, sem fim')
    expect(flat(card.textContent)).toContain('R$ 954,00 /mês')
    expect(flat(card.textContent)).toContain('Parte de out/2026')
    expect(within(card).queryByRole('progressbar')).toBeNull()
    cleanup()

    renderAt('/receber/compra/r5/editar')
    fireEvent.change(screen.getByLabelText('Último mês (para encerrar)'), { target: { value: '2026-11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    const saved = store.updateReceivable.mock.calls[0][1]
    expect(saved).toMatchObject({ endMonth: '2026-11', recurring: true })
    expect(saved.installments.map((i: { dueDate: string }) => i.dueDate)).toEqual(['2026-10-10', '2026-11-10'])
  })
})

describe('+ Nova conta no rateio', () => {
  const aluguel: Bill = {
    id: 'b1', name: 'Aluguel', category: 'Moradia', supplier: '', valueType: 'fixed', expectedAmountCents: 190800, dueDay: 10,
    recurrence: 'monthly', startMonth: '2026-01', paymentMethod: 'pix', notes: '', active: true,
  }
  beforeEach(() => window.sessionStorage.clear())

  it('guarda o que foi preenchido, abre o cadastro da conta e, ao voltar, recupera tudo com a conta nova escolhida', () => {
    hooks.useBills.mockReturnValue({ data: [], ready: true, error: null })
    let landed = ''
    render(
      <MemoryRouter initialEntries={['/receber/nova?pessoa=p1&tipo=rateio']}>
        <Routes>
          <Route path="/receber/nova" element={<ReceivableForm />} />
          <Route path="/contas/nova" element={<NovaContaSpy onSeen={(to) => (landed = to)} />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/Parte da pessoa por mês/), { target: { value: '954,00' } })
    fireEvent.change(screen.getByLabelText('Descrição (opcional)'), { target: { value: 'Parte da Ana' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Nova conta' }))
    expect(landed).toBe('/receber/nova?pessoa=p1&tipo=rateio')
    cleanup()

    // a conta foi criada e o cadastro voltou com ?conta=
    hooks.useBills.mockReturnValue({ data: [aluguel], ready: true, error: null })
    renderAt('/receber/nova?pessoa=p1&tipo=rateio&conta=b1')
    expect((screen.getByLabelText('Conta a pagar dividida') as HTMLSelectElement).value).toBe('b1')
    expect((screen.getByLabelText(/Parte da pessoa por mês/) as HTMLInputElement).value).toBe('954,00')
    expect((screen.getByLabelText('Descrição (opcional)') as HTMLInputElement).value).toBe('Parte da Ana')
    // o rascunho é usado uma vez só
    expect(window.sessionStorage.getItem('contas-em-dia:rascunho-receber')).toBeNull()
  })
})

function NovaContaSpy({ onSeen }: { onSeen: (to: string) => void }) {
  const [params] = useSearchParams()
  onSeen(params.get('voltar') ?? '')
  return <p>cadastro da conta</p>
}

describe('período do resumo (Mês | Ano | Tudo)', () => {
  it('começa em Mês: o que vence neste mês mais o que está atrasado; a escolha fica guardada', () => {
    window.localStorage.removeItem('contas-em-dia:escolha:receber-periodo')
    // Tênis: 3 × 126,00 de 05/09; parcela 1 recebida; 2 (05/10) e 3 (05/11) em aberto; hoje é 09/11
    renderAt('/receber')
    const picker = screen.getByRole('group', { name: 'Período do resumo' })
    expect(within(picker).getByRole('button', { name: 'Mês' }).getAttribute('aria-pressed')).toBe('true')
    expect(flat(screen.getByText(/^Falta receber/).parentElement!.textContent)).toContain('Falta receber neste mês')
    fireEvent.click(within(picker).getByRole('button', { name: 'Tudo' }))
    expect(flat(screen.getByText(/^Falta receber/).parentElement!.textContent)).toContain('Falta receber no total')
    expect(window.localStorage.getItem('contas-em-dia:escolha:receber-periodo')).toBe('tudo')
  })

  it('no rateio sem fim, Mês mostra só o mês e Ano soma até dezembro', () => {
    window.localStorage.setItem('contas-em-dia:escolha:receber-periodo', 'mes')
    const r: Receivable = {
      id: 'r5', personId: 'p1', kind: 'rateio', description: 'Parte da Ana', totalCents: 0, installmentCount: 0,
      firstDueDate: '2026-11-18', installments: [], notes: '', billId: 'b1', recurring: true, monthlyCents: 100000, endMonth: null,
    }
    setData([ana], [extendRecurring(r, '2026-12')])
    renderAt('/receber?aba=rateios')
    const main = () => flat(screen.getByText(/^Falta receber/).parentElement!.textContent)
    expect(main()).toContain('R$ 1.000,00')
    fireEvent.click(screen.getByRole('button', { name: 'Ano' }))
    expect(main()).toContain('R$ 2.000,00') // novembro e dezembro
    cleanup()
    renderAt('/receber/pessoa/p1')
    expect(flat(screen.getByRole('region', { name: 'Parte da Ana' }).textContent)).toContain('falta R$ 1.000,00 este mês')
  })
})

describe('Serviço prestado mensal (v1.21)', () => {
  const servicoMensal = (over: Partial<Receivable> = {}): Receivable => ({
    id: 'r9',
    personId: 'p1',
    kind: 'servico',
    description: 'Aulas de inglês',
    totalCents: 70000,
    installmentCount: 2,
    firstDueDate: '2026-10-15',
    installments: [
      { number: 1, dueDate: '2026-10-15', amountCents: 35000, paidAt: '2026-10-15', paidAmountCents: 35000 },
      { number: 2, dueDate: '2026-11-15', amountCents: 35000, paidAt: null, paidAmountCents: null },
    ],
    notes: '',
    monthlyCents: 35000,
    recurring: true,
    endMonth: null,
    valueType: 'variable',
    ...over,
  })

  it('sem número de parcelas e variável: repete todo mês, com o previsto e o tipo de valor gravados', () => {
    renderAt('/receber/nova?pessoa=p1&tipo=servico')
    fireEvent.change(screen.getByLabelText('Qual foi o serviço'), { target: { value: 'Aulas de inglês' } })
    fireEvent.change(screen.getByLabelText('Tipo de valor'), { target: { value: 'variable' } })
    expect(screen.getByText(/cada mês tem “Informar valor”/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Valor previsto por mês (R$)'), { target: { value: '350,00' } })
    fireEvent.change(screen.getByLabelText('Dia do vencimento'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Começa em'), { target: { value: '2026-11' } })
    expect(screen.getByText(/o serviço se repete todo mês/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const saved = store.createReceivable.mock.calls[0][1].receivable
    expect(saved).toMatchObject({ kind: 'servico', recurring: true, valueType: 'variable', monthlyCents: 35000, endMonth: null })
    // grava até o mês que vem; os seguintes o app completa ao ler
    expect(saved.installments.map((i: { dueDate: string }) => i.dueDate)).toEqual(['2026-11-15', '2026-12-15'])
  })

  it('pede o dia do vencimento e o valor', () => {
    renderAt('/receber/nova?pessoa=p1&tipo=servico')
    fireEvent.change(screen.getByLabelText('Qual foi o serviço'), { target: { value: 'Faxina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert').textContent).toBe('Informe o valor por mês. Exemplo: 350,00')
    expect(store.createReceivable).not.toHaveBeenCalled()
  })

  it('na tela da pessoa, o mês variável mostra o previsto e o botão Informar valor', () => {
    setData([ana], [servicoMensal()])
    renderAt('/receber/pessoa/p1')
    const section = screen.getByRole('region', { name: 'Aulas de inglês' })
    expect(flat(section.textContent)).toContain('/mês (previsto)')
    expect(section.textContent).toContain('Mensalidade de nov/2026')
    expect(section.textContent).toContain('Valor previsto: informe o do mês')
    fireEvent.click(within(section).getByRole('button', { name: /Informar valor da mensalidade de nov\/2026/ }))
    fireEvent.change(within(section).getByLabelText('Valor deste mês'), { target: { value: '412,50' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Salvar valor' }))
    expect(store.setInstallmentAmount).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'r9' }), 2, 41250)
  })

  it('o serviço fixo não tem Informar valor; o antigo continua no valor total parcelado', () => {
    setData([ana], [servicoMensal({ valueType: 'fixed' }), instalacao()])
    renderAt('/receber/pessoa/p1')
    expect(screen.queryByRole('button', { name: /Informar valor/ })).toBeNull()
    cleanup()
    setData([ana], [instalacao()])
    renderAt('/receber/compra/r2/editar')
    expect(screen.getByLabelText(/Valor total/)).toBeTruthy()
    expect(screen.queryByLabelText('Tipo de valor')).toBeNull()
  })

  it('editar o serviço mensal abre nos campos mensais e mantém o que foi registrado', () => {
    const mensal = servicoMensal({
      installments: [
        { number: 1, dueDate: '2026-10-15', amountCents: 35000, paidAt: '2026-10-15', paidAmountCents: 35000 },
        { number: 2, dueDate: '2026-11-15', amountCents: 41250, paidAt: null, paidAmountCents: null, amountSet: true },
      ],
    })
    setData([ana], [mensal])
    renderAt('/receber/compra/r9/editar')
    expect((screen.getByLabelText('Tipo de valor') as HTMLSelectElement).value).toBe('variable')
    expect((screen.getByLabelText('Valor previsto por mês (R$)') as HTMLInputElement).value).toBe('350,00')
    expect((screen.getByLabelText('Dia do vencimento') as HTMLSelectElement).value).toBe('15')
    expect(screen.getByLabelText('Último mês (para encerrar)')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Valor previsto por mês (R$)'), { target: { value: '380,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    const saved = store.updateReceivable.mock.calls[0][1]
    expect(saved).toMatchObject({ kind: 'servico', monthlyCents: 38000, recurring: true, valueType: 'variable', billId: null })
    expect(saved.installments[0]).toMatchObject({ paidAt: '2026-10-15', amountCents: 35000 })
    expect(saved.installments[1]).toMatchObject({ amountCents: 41250, amountSet: true })
  })
})
