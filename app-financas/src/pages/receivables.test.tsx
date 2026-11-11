// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildInstallments, withPayment } from '../domain/receivables'
import type { Person, Receivable } from '../domain/types'

const TODAY = '2026-11-09'
const flat = (s: string | null) => (s ?? '').replace(/ /g, ' ')

const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '11987654321', email: 'ana@exemplo.com' }
const bruno: Person = { id: 'p2', name: 'Bruno Lima', phone: '', email: '' }

const tenis = (): Receivable => ({
  id: 'r1',
  personId: 'p1',
  description: 'Tênis',
  totalCents: 42000,
  installmentCount: 10,
  firstDueDate: '2026-09-05',
  installments: withPayment(buildInstallments(42000, 10, '2026-09-05'), 1, { paidAt: '2026-09-05', paidAmountCents: 4200 }),
  notes: '',
})

const hooks = vi.hoisted(() => ({ usePeople: vi.fn(), useReceivables: vi.fn(), useToday: vi.fn() }))
const store = vi.hoisted(() => ({
  createReceivable: vi.fn(),
  setInstallmentPayment: vi.fn(),
  updatePerson: vi.fn(),
  deleteReceivable: vi.fn(),
  deletePerson: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
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
        <Route path="/receber/pessoa/:id" element={<PersonPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  hooks.useToday.mockReturnValue(TODAY)
  setData([ana, bruno], [tenis()])
  store.createReceivable.mockReturnValue({ personId: 'pNovo', receivableId: 'r9', done: Promise.resolve() })
  for (const fn of [store.setInstallmentPayment, store.updatePerson, store.deleteReceivable, store.deletePerson]) {
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
    expect(flat(screen.getByText('Falta receber').parentElement!.textContent)).toContain('R$ 378,00')
    expect(screen.getByRole('status').textContent).toContain('2 parcelas atrasadas')
    const row = screen.getByRole('link', { name: /Ana Souza/ })
    expect(row.textContent).toContain('2 parcelas atrasadas')
    expect(row.getAttribute('href')).toBe('/receber/pessoa/p1')
    expect(screen.getByRole('link', { name: /Bruno Lima/ }).textContent).toContain('Sem compras')
  })

  it('mostra o convite quando não há ninguém', () => {
    setData([], [])
    renderAt('/receber')
    expect(screen.getByText('Ninguém te deve nada por aqui')).toBeTruthy()
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
    expect(input.person).toEqual({ name: 'Carla Dias', phone: '11912345678', email: 'carla@exemplo.com' })
    expect(input.receivable).toMatchObject({ description: 'Geladeira', totalCents: 100000, installmentCount: 3, firstDueDate: '2026-12-10' })
    expect(input.receivable.installments.map((i: { amountCents: number }) => i.amountCents)).toEqual([33334, 33333, 33333])
  })

  it('usa uma pessoa já cadastrada e aceita parcelas já recebidas', () => {
    renderAt('/receber/nova?pessoa=p1')
    expect((screen.getByLabelText('Quem vai pagar') as HTMLSelectElement).value).toBe('p1')
    fireEvent.change(screen.getByLabelText('O que foi'), { target: { value: 'Celular' } })
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: '1200' } })
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
    const v = { name: 'Dani', phone: '', email: '', total: '100', count: '2', received: '0', ...over }
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
    expect(flat(text)).toContain('Não localizei o pagamento das parcelas 2 e 3 de 10 (Tênis), que somam R$ 84,00')
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
    expect(store.updatePerson).toHaveBeenCalledWith('u1', { id: 'p1', name: 'Ana Souza', phone: '21998765432', email: 'ana@exemplo.com' })
  })

  it('não deixa salvar contato inválido', () => {
    renderAt('/receber/pessoa/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Editar contato' }))
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'sem-arroba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(screen.getByRole('alert').textContent).toContain('E-mail inválido')
    expect(store.updatePerson).not.toHaveBeenCalled()
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
    expect(screen.getByRole('button', { name: 'Cobrar Bruno' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pessoa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(store.deletePerson).toHaveBeenCalledWith('u1', 'p2')
  })

  it('avisa quando a pessoa não existe', () => {
    renderAt('/receber/pessoa/xx')
    expect(screen.getByText('Pessoa não encontrada.')).toBeTruthy()
  })
})
