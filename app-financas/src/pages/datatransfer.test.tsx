// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildInstallments } from '../domain/receivables'
import type { Bill, Person, Receivable } from '../domain/types'

const TODAY = '2026-11-09'

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useToday: vi.fn(),
}))
const store = vi.hoisted(() => ({ importBills: vi.fn(), importReceivables: vi.fn() }))
const files = vi.hoisted(() => ({ saveCsv: vi.fn() }))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)
vi.mock('../data/files', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/files')>()), ...files }))

import DataTransfer from './DataTransfer'

const luz: Bill = {
  id: 'b1',
  name: 'Energia elétrica',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'variable',
  expectedAmountCents: 18000,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
}
const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '11987654321', email: '', charges: [] }
const tenis: Receivable = {
  id: 'r1',
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 42000,
  installmentCount: 10,
  firstDueDate: '2026-09-05',
  installments: buildInstallments(42000, 10, '2026-09-05'),
  notes: '',
}

function setData(bills: Bill[], people: Person[], receivables: Receivable[], ready = true) {
  hooks.useBills.mockReturnValue({ data: bills, ready, error: null })
  hooks.usePeople.mockReturnValue({ data: people, ready, error: null })
  hooks.useReceivables.mockReturnValue({ data: receivables, ready, error: null })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ajustes/planilhas']}>
      <Routes>
        <Route path="/ajustes/planilhas" element={<DataTransfer />} />
        <Route path="/ajustes" element={<p>Ajustes</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const card = (name: string) => within(screen.getByRole('region', { name }))

async function upload(input: HTMLElement, content: string | Uint8Array, fileName = 'planilha.csv') {
  const file = new File([content as BlobPart], fileName, { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
  await screen.findByText(fileName)
}

beforeEach(() => {
  hooks.useToday.mockReturnValue(TODAY)
  setData([], [], [])
  store.importBills.mockResolvedValue(undefined)
  store.importReceivables.mockResolvedValue(undefined)
  files.saveCsv.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Planilhas (CSV)', () => {
  it('mostra as duas áreas e não deixa exportar quando não há nada', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Planilhas (CSV)' })).toBeTruthy()
    for (const name of ['Contas a pagar', 'A receber']) {
      expect((card(name).getByRole('button', { name: 'Exportar CSV' }) as HTMLButtonElement).disabled).toBe(true)
      expect(card(name).getByText('Ainda não há nada para exportar.')).toBeTruthy()
      expect(card(name).getByRole('button', { name: 'Baixar modelo' })).toBeTruthy()
    }
  })

  it('espera os dados carregarem antes de aceitar arquivo (para não duplicar)', () => {
    setData([], [], [], false)
    renderPage()
    expect((card('Contas a pagar').getByLabelText('Importar CSV') as HTMLInputElement).disabled).toBe(true)
    expect((card('A receber').getByLabelText('Importar CSV') as HTMLInputElement).disabled).toBe(true)
  })

  it('exporta as contas com o nome do arquivo datado', async () => {
    setData([luz], [], [])
    renderPage()
    fireEvent.click(card('Contas a pagar').getByRole('button', { name: 'Exportar CSV' }))
    await waitFor(() => expect(files.saveCsv).toHaveBeenCalledTimes(1))
    const [name, content] = files.saveCsv.mock.calls[0]
    expect(name).toBe('contas-a-pagar-2026-11-09.csv')
    expect(content).toContain('Energia elétrica')
    expect(content.startsWith('﻿')).toBe(true)
    expect(await screen.findByText(/Arquivo contas-a-pagar-2026-11-09.csv pronto/)).toBeTruthy()
  })

  it('exporta o a receber com a pessoa', async () => {
    setData([], [ana], [tenis])
    renderPage()
    fireEvent.click(card('A receber').getByRole('button', { name: 'Exportar CSV' }))
    await waitFor(() => expect(files.saveCsv).toHaveBeenCalled())
    const [name, content] = files.saveCsv.mock.calls[0]
    expect(name).toBe('a-receber-2026-11-09.csv')
    expect(content).toContain('Ana Souza;(11) 98765-4321')
  })

  it('baixa o modelo', async () => {
    renderPage()
    fireEvent.click(card('A receber').getByRole('button', { name: 'Baixar modelo' }))
    await waitFor(() => expect(files.saveCsv).toHaveBeenCalled())
    expect(files.saveCsv.mock.calls[0][0]).toBe('modelo-a-receber.csv')
    expect(files.saveCsv.mock.calls[0][1]).toContain('Primeiro vencimento')
  })

  it('mostra a prévia das contas, com os erros por linha, e só grava o que está certo', async () => {
    renderPage()
    const csv = ['Nome;Valor;Dia do vencimento', 'Internet;99,90;5', 'Luz;abc;10', 'Aluguel;1500;1'].join('\r\n')
    await upload(card('Contas a pagar').getByLabelText('Importar CSV'), csv)

    expect(card('Contas a pagar').getByText('novas para importar')).toBeTruthy()
    expect(card('Contas a pagar').getByText(/Linha 3:/)).toBeTruthy()
    expect(card('Contas a pagar').getByText(/valor inválido “abc”/)).toBeTruthy()
    expect(store.importBills).not.toHaveBeenCalled()

    fireEvent.click(card('Contas a pagar').getByRole('button', { name: 'Importar 2 contas' }))
    await waitFor(() => expect(store.importBills).toHaveBeenCalledTimes(1))
    const [uid, bills] = store.importBills.mock.calls[0]
    expect(uid).toBe('u1')
    expect(bills.map((b: Bill) => b.name)).toEqual(['Internet', 'Aluguel'])
    expect(await screen.findByText(/2 contas importadas\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver contas' }).getAttribute('href')).toBe('/contas')
    expect(card('Contas a pagar').queryByText('Internet;99,90;5')).toBeNull()
  })

  it('ignora o que já está cadastrado', async () => {
    setData([luz], [], [])
    renderPage()
    await upload(card('Contas a pagar').getByLabelText('Importar CSV'), 'Nome;Valor;Dia do vencimento\nEnergia elétrica;180;10\n')
    expect(card('Contas a pagar').getByText('já cadastrada (ignorada)')).toBeTruthy()
    expect((card('Contas a pagar').getByRole('button', { name: 'Importar 0 contas' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('lê o CSV do Excel em Windows-1252 (acentos)', async () => {
    renderPage()
    // "Nome;Dia do vencimento\nServiço;5" com ç = 0xE7
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('Nome;Dia do vencimento\nServi'),
      0xe7,
      ...new TextEncoder().encode('o;5'),
    ])
    await upload(card('Contas a pagar').getByLabelText('Importar CSV'), bytes)
    fireEvent.click(card('Contas a pagar').getByRole('button', { name: 'Importar 1 conta' }))
    await waitFor(() => expect(store.importBills).toHaveBeenCalled())
    expect(store.importBills.mock.calls[0][1][0].name).toBe('Serviço')
  })

  it('explica quando o arquivo não serve', async () => {
    renderPage()
    await upload(card('Contas a pagar').getByLabelText('Importar CSV'), 'Nome;Valor\nLuz;10\n')
    expect(card('Contas a pagar').getByRole('alert').textContent).toContain('“Dia do vencimento”')
    expect(card('Contas a pagar').queryByRole('button', { name: /^Importar \d/ })).toBeNull()
  })

  it('cancelar descarta a prévia sem gravar', async () => {
    renderPage()
    await upload(card('Contas a pagar').getByLabelText('Importar CSV'), 'Nome;Dia do vencimento\nLuz;10\n')
    fireEvent.click(card('Contas a pagar').getByRole('button', { name: 'Cancelar' }))
    expect(card('Contas a pagar').queryByText('planilha.csv')).toBeNull()
    expect(store.importBills).not.toHaveBeenCalled()
  })

  it('importa o a receber e avisa das pessoas novas', async () => {
    setData([], [ana], [])
    renderPage()
    const csv = [
      'Pessoa;Telefone;Tipo;Descrição;Valor total;Parcelas;Primeiro vencimento;Parcelas recebidas',
      'ana souza;;Cartão;Bolsa;300;3;01/12/2026;0',
      'Bruno Lima;(21) 99999-8888;Serviço;Instalação;900;3;15/12/2026;1',
    ].join('\n')
    await upload(card('A receber').getByLabelText('Importar CSV'), csv)
    expect(card('A receber').getByText('1 pessoa nova será cadastrada.')).toBeTruthy()

    fireEvent.click(card('A receber').getByRole('button', { name: 'Importar 2 compras' }))
    await waitFor(() => expect(store.importReceivables).toHaveBeenCalledTimes(1))
    const [uid, plan] = store.importReceivables.mock.calls[0]
    expect(uid).toBe('u1')
    expect(plan.newPeople.map((p: { person: Person }) => p.person.name)).toEqual(['Bruno Lima'])
    expect(plan.items.map((i: { personId: string | null }) => i.personId)).toEqual(['p1', null])
    expect(await screen.findByText(/2 compras importadas\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver a receber' }).getAttribute('href')).toBe('/receber')
  })

  it('se a gravação falhar, mantém a prévia e avisa', async () => {
    store.importBills.mockRejectedValue(new Error('permission-denied'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderPage()
    await upload(card('Contas a pagar').getByLabelText('Importar CSV'), 'Nome;Dia do vencimento\nLuz;10\n')
    fireEvent.click(card('Contas a pagar').getByRole('button', { name: 'Importar 1 conta' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Não consegui importar')
    expect(card('Contas a pagar').getByRole('button', { name: 'Importar 1 conta' })).toBeTruthy()
  })

  it('recusa arquivo grande demais', async () => {
    renderPage()
    const big = new File(['x'.repeat(10)], 'grande.csv', { type: 'text/csv' })
    Object.defineProperty(big, 'size', { value: 2_000_000 })
    fireEvent.change(card('Contas a pagar').getByLabelText('Importar CSV'), { target: { files: [big] } })
    expect((await screen.findByRole('alert')).textContent).toContain('grande demais')
  })
})
