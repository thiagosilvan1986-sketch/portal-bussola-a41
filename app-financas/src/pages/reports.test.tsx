// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivacyProvider } from '../data/privacy'
import { buildEntry } from '../domain/bills'
import { buildInstallments, withPayment } from '../domain/receivables'
import type { Bill, Entry, Person, Receivable } from '../domain/types'

const TODAY = '2026-11-11'
const flat = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ')

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
  skippedMonths: [],
  ...over,
})
const aluguel = bill({ id: 'b2', name: 'Aluguel', category: 'Moradia', expectedAmountCents: 100000, dueDay: 10 })

const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '', email: '', charges: [] }
const tenis: Receivable = {
  id: 'r1',
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 30000,
  installmentCount: 3,
  firstDueDate: '2026-10-10',
  installments: withPayment(buildInstallments(30000, 3, '2026-10-10'), 1, { paidAt: '2026-10-10', paidAmountCents: 10000 }),
  notes: '',
}

// 4º trimestre de 2026 (out, nov, dez): outubro e novembro lançados; dezembro será previsto.
const entries: Entry[] = [
  { ...buildEntry(bill(), '2026-10'), paidAt: '2026-10-05', paidAmountCents: 20000 },
  { ...buildEntry(aluguel, '2026-10'), paidAt: '2026-10-10', paidAmountCents: 100000 },
  buildEntry(bill(), '2026-11'), // venceu dia 5/11: atrasada
  buildEntry(aluguel, '2026-11'), // venceu dia 10/11: atrasada
]

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(),
  usePeople: vi.fn(),
  useReceivables: vi.fn(),
  useEntriesRange: vi.fn(),
  useToday: vi.fn(),
}))
vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)

import Reports from './Reports'

const live = <T,>(data: T[]) => ({ data, ready: true, error: null })

/** Abre os Relatórios. Os testes antigos foram escritos para o trimestre; o padrão agora é o mês. */
function renderReports(kind: 'Mês' | 'Trimestre' = 'Trimestre') {
  const result = render(
    <MemoryRouter>
      <PrivacyProvider>
        <Reports />
      </PrivacyProvider>
    </MemoryRouter>,
  )
  if (kind !== 'Mês') fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de período' })).getByRole('button', { name: kind }))
  return result
}

beforeEach(() => {
  hooks.useToday.mockReturnValue(TODAY)
  hooks.useBills.mockReturnValue(live([bill(), aluguel]))
  hooks.usePeople.mockReturnValue(live([ana]))
  hooks.useReceivables.mockReturnValue(live([tenis]))
  hooks.useEntriesRange.mockReturnValue(live(entries))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

const kpi = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.kpi')).find((el) => el.firstElementChild?.textContent === name)!

describe('Relatórios', () => {
  it('abre no trimestre atual e consulta os meses certos', () => {
    renderReports()
    expect(screen.getByRole('heading', { level: 2, name: '4º trimestre de 2026' })).toBeTruthy()
    expect(screen.getByText('out a dez')).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-10', '2026-12')
    expect(screen.getByRole('button', { name: 'Trimestre' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('consolida o que paga e o que recebe, com a previsão de dezembro', () => {
    renderReports()
    // A pagar: out 1.200 + nov 1.200 + dez (previsto) 1.200 = 3.600; pago 1.200
    const pay = kpi('A pagar')
    expect(flat(pay.textContent)).toContain('R$ 3.600,00')
    expect(flat(pay.textContent)).toContain('Pago R$ 1.200,00')
    expect(flat(pay.textContent)).toContain('Em aberto R$ 2.400,00')
    // A receber: 3 parcelas de 100 = 300; recebido 100
    const recv = kpi('A receber')
    expect(flat(recv.textContent)).toContain('R$ 300,00')
    expect(flat(recv.textContent)).toContain('Recebido R$ 100,00')
    expect(flat(recv.textContent)).toContain('Em aberto R$ 200,00')
    // Saldo previsto: 300 - 3.600 = falta 3.300; realizado: 100 - 1.200 = menos 1.100
    const balance = kpi('Saldo previsto do período')
    expect(flat(balance.textContent)).toContain('Falta R$ 3.300,00')
    expect(flat(balance.textContent)).toContain('Realizado até agora: menos R$ 1.100,00')
    expect(balance.className).toContain('balance-neg')
  })

  it('avisa o que está em atraso', () => {
    renderReports()
    const alert = screen.getByRole('status')
    // pagar: 200 + 1.000 de novembro; receber: parcelas 2 (10/11) e 3 (10/12 ainda não vence) -> 100 + 0
    expect(flat(alert.textContent)).toContain('a pagar R$ 1.200,00')
    expect(flat(alert.textContent)).toContain('a receber R$ 100,00')
  })

  it('o detalhamento traz mês a mês, marca o mês previsto e soma o total', () => {
    renderReports()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').map((r) => flat(r.textContent))
    expect(rows[1]).toContain('out')
    expect(rows[1]).toContain('R$ 1.200,00')
    expect(rows[3]).toContain('dez*')
    expect(rows[4]).toContain('Total')
    expect(rows[4]).toContain('R$ 3.600,00')
    expect(screen.getByText(/Mês sem lançamento ainda/)).toBeTruthy()
  })

  it('tocar em um mês do gráfico mostra os valores dele; tocar de novo desfaz', () => {
    renderReports()
    expect(screen.getByText('Toque em um mês do gráfico para ver os valores.')).toBeTruthy()
    const nov = screen.getByRole('button', { name: /^nov: a pagar/ })
    fireEvent.click(nov)
    const readout = flat(document.querySelector('.chart-readout')!.textContent)
    expect(readout).toContain('novembro de 2026')
    expect(readout).toContain('a pagar R$ 1.200,00 (pago R$ 0,00)')
    expect(readout).toContain('a receber R$ 100,00')
    fireEvent.click(screen.getByRole('button', { name: /^nov: a pagar/ }))
    expect(screen.getByText('Toque em um mês do gráfico para ver os valores.')).toBeTruthy()
  })

  it('o gráfico também funciona pelo teclado', () => {
    renderReports()
    fireEvent.keyDown(screen.getByRole('button', { name: /^out: a pagar/ }), { key: 'Enter' })
    expect(flat(document.querySelector('.chart-readout')!.textContent)).toContain('outubro de 2026')
  })

  it('troca para semestre e ano e volta ao período atual', () => {
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Semestre' }))
    expect(screen.getByRole('heading', { level: 2, name: '2º semestre de 2026' })).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-07', '2026-12')
    fireEvent.click(screen.getByRole('button', { name: 'Ano' }))
    expect(screen.getByRole('heading', { level: 2, name: '2026' })).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-01', '2026-12')
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(14) // cabeçalho + 12 meses + total

    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }))
    expect(screen.getByRole('heading', { level: 2, name: '2025' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao período atual' }))
    expect(screen.getByRole('heading', { level: 2, name: '2026' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Voltar ao período atual' })).toBeNull()
  })

  it('navega entre trimestres, atravessando o ano', () => {
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo período' }))
    expect(screen.getByRole('heading', { level: 2, name: '1º trimestre de 2027' })).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2027-01', '2027-03')
  })

  it('mostra para onde vai o dinheiro e quem mais deve', () => {
    renderReports()
    const cats = screen.getByRole('region', { name: 'Contas a pagar por categoria' })
    const items = within(cats).getAllByRole('listitem').map((li) => flat(li.textContent))
    expect(items[0]).toContain('Moradia')
    expect(items[0]).toContain('R$ 3.000,00')
    expect(items[0]).toContain('83%')
    expect(items[1]).toContain('Contas de consumo')
    const debtors = screen.getByRole('region', { name: 'Quem mais deve' })
    expect(within(debtors).getByRole('link').getAttribute('href')).toBe('/receber/pessoa/p1')
    expect(flat(debtors.textContent)).toContain('Ana Souza')
    expect(flat(debtors.textContent)).toContain('R$ 200,00')
    expect(flat(debtors.textContent)).toContain('R$ 100,00 em atraso')
  })

  it('com o olhinho fechado, nenhum valor aparece (nem na tabela nem no gráfico)', () => {
    localStorage.setItem('contas-em-dia:ocultar-valores', '1')
    renderReports()
    expect(document.body.textContent).not.toMatch(/\d\.\d{3},\d{2}|\d+,\d{2}/)
    expect(flat(kpi('A pagar').textContent)).toContain('R$ ••••')
    expect(screen.getByRole('button', { name: /^nov: a pagar R\$ ••••/ })).toBeTruthy()
  })

  it('período sem nada mostra um aviso em vez de gráficos vazios', () => {
    hooks.useEntriesRange.mockReturnValue(live([]))
    hooks.useBills.mockReturnValue(live([]))
    hooks.useReceivables.mockReturnValue(live([]))
    renderReports()
    expect(screen.getByText('Nada neste período')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('meses passados não são inventados: só entra o que foi lançado', () => {
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' })) // 3º trimestre
    expect(screen.queryByText(/Mês sem lançamento ainda/)).toBeNull()
  })

  it('compara com o período anterior e avisa quando não há base de comparação', () => {
    // 3º trimestre (jul a set): só o aluguel, 1.000 por mês = 3.000. Agora: 3.600 (+20%).
    hooks.useEntriesRange.mockImplementation((_uid: string, from: string) =>
      live(from === '2026-07' ? ['2026-07', '2026-08', '2026-09'].map((c) => buildEntry(aluguel, c)) : entries),
    )
    renderReports()
    expect(flat(kpi('A pagar').textContent)).toContain('▲ 20% a mais que o trimestre anterior')
    expect(flat(kpi('A receber').textContent)).toContain('Sem dados no trimestre anterior')
    // Saldo: agora −3.300; antes −3.000 (nada a receber) → R$ 300,00 pior
    expect(flat(kpi('Saldo previsto do período').textContent)).toContain('▼ R$ 300,00 pior que o trimestre anterior')
    expect(flat(kpi('Saldo previsto do período').textContent)).toContain('O que entra cobre 8% do que sai.')
  })

  it('filtra por A pagar, por A receber e por categoria, sempre pelo mesmo recorte', () => {
    renderReports()
    expect(kpi('A pagar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'A pagar' }))
    expect(kpi('A receber')).toBeUndefined()
    expect(kpi('Saldo previsto do período')).toBeUndefined()
    expect(within(screen.getByRole('table')).queryByRole('columnheader', { name: 'A receber' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Quem mais deve' })).toBeNull()

    // Escolher uma categoria mostra só o que ela paga; "Todas" volta ao total.
    fireEvent.click(within(screen.getByRole('group', { name: 'Categoria' })).getByRole('button', { name: 'Moradia' }))
    expect(flat(kpi('A pagar').textContent)).toContain('R$ 3.000,00')
    expect(screen.getByRole('button', { name: 'Moradia' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(flat(kpi('A pagar').textContent)).toContain('R$ 3.600,00')

    fireEvent.click(screen.getByRole('button', { name: 'A receber' }))
    expect(kpi('A pagar')).toBeUndefined()
    expect(flat(kpi('A receber').textContent)).toContain('R$ 300,00')
    expect(screen.queryByRole('group', { name: 'Categoria' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Contas a pagar por categoria' })).toBeNull()
    expect(flat(screen.getByRole('status').textContent)).toBe('⚠ Em atraso no período: a receber R$ 100,00')
    expect(flat(screen.getByRole('region', { name: 'Mapa de vencimentos' }).textContent)).toContain('parcelas a receber')

    // Escolher "Tudo" de novo limpa a categoria e traz tudo de volta.
    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }))
    expect(flat(kpi('A pagar').textContent)).toContain('R$ 3.600,00')
  })

  it('o gráfico troca entre barras e acumulado e avisa em que mês falta dinheiro', () => {
    renderReports()
    expect(screen.queryByText(/Falta dinheiro a partir de/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }))
    expect(screen.getByRole('group', { name: 'Gráfico de linha com o valor acumulado mês a mês' })).toBeTruthy()
    // Outubro: entra 100, sai 1.200 → falta já no primeiro mês; acumulado de out = −1.100
    expect(screen.getByRole('button', { name: /^out: acumulado menos R\$.1\.100,00/ })).toBeTruthy()
    expect(flat(document.querySelector('.insight')!.textContent)).toContain('Falta dinheiro a partir de out.')
    fireEvent.click(screen.getByRole('button', { name: /^nov: acumulado/ }))
    expect(flat(document.querySelector('.chart-readout')!.textContent)).toContain('acumulado menos R$ 2.200,00')
    fireEvent.click(screen.getByRole('button', { name: 'Barras' }))
    expect(screen.getByRole('group', { name: 'Gráfico de barras por mês' })).toBeTruthy()
  })

  it('arrastar sobre o gráfico mostra os valores do mês sob o dedo', () => {
    renderReports()
    const wrap = document.querySelector('.chart-wrap') as HTMLElement
    wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 196, right: 360, bottom: 196, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const svg = document.querySelector('.chart-svg')!
    expect(document.querySelector('.chart-tip')).toBeNull()
    // largura útil: 64 a 352 de 360; 3 meses de 96; o meio do segundo mês fica em x = 64 + 96 + 48 = 208
    fireEvent.pointerMove(svg, { clientX: 208, pointerType: 'mouse' })
    const tip = flat(document.querySelector('.chart-tip')!.textContent)
    expect(tip).toContain('nov')
    expect(tip).toContain('A pagar R$ 1.200,00')
    expect(tip).toContain('A receber R$ 100,00')
    fireEvent.pointerLeave(svg, { pointerType: 'mouse' })
    expect(document.querySelector('.chart-tip')).toBeNull()
  })

  it('o mapa de vencimentos soma o que vence em cada dia e lista os dias com conta', () => {
    renderReports()
    const map = screen.getByRole('region', { name: 'Mapa de vencimentos' })
    // aluguel dia 10 (out, nov, dez) = 3.000; energia dia 5 = 600
    const day10 = within(map).getByRole('button', { name: /^Dia 10: R\$.3\.000,00, 3 vencimentos/ })
    expect(within(map).getByRole('button', { name: 'Dia 11: nada vence' })).toBeTruthy()
    expect(flat(map.textContent)).toContain('Dia mais carregado: dia 10')
    fireEvent.click(day10)
    expect(flat(map.querySelector('.chart-readout')!.textContent)).toContain('Dia 10: R$ 3.000,00 em 3 vencimentos')
    expect(day10.getAttribute('aria-pressed')).toBe('true')
    // o dia tocado mostra as contas dele, com a data (o período tem 3 meses)
    const items = within(map).getByRole('list', { name: 'Vencimentos do dia 10' })
    expect(within(items).getAllByRole('listitem').map((li) => flat(li.textContent))).toEqual([
      '10/10 · AluguelR$ 1.000,00',
      '10/11 · AluguelR$ 1.000,00',
      '10/12 · AluguelR$ 1.000,00',
    ])
    // lista: Detalhado (padrão) traz conta por conta; Consolidado, um total por dia
    const list = map.querySelector('.heat-list') as HTMLElement
    const modes = within(list).getByRole('group', { name: 'Como mostrar a lista' })
    expect(within(modes).getByRole('button', { name: 'Detalhado' }).getAttribute('aria-pressed')).toBe('true')
    expect(flat(list.querySelector('.heat-detail')!.textContent)).toContain('Energia')
    fireEvent.click(within(modes).getByRole('button', { name: 'Consolidado' }))
    expect(list.querySelector('.heat-detail')).toBeNull()
    expect(list.querySelectorAll('ul > li')).toHaveLength(2)
  })

  it('o fluxo do dinheiro fecha os dois lados e escolher uma categoria nele abre as contas dela', () => {
    renderReports()
    const flow = screen.getByRole('region', { name: 'Fluxo do dinheiro' })
    // entra 300; sai 3.600; falta 3.300
    expect(flat(flow.textContent)).toContain('▼ Falta')
    expect(flat(flow.textContent)).toContain('R$ 3.300,00')
    const moradia = within(flow).getByRole('button', { name: /^Moradia: R\$.3\.000,00, 83% do que sai/ })
    fireEvent.click(moradia)
    // vira filtro de categoria (só A pagar); o fluxo continua à vista, com a categoria em destaque
    expect(within(screen.getByRole('region', { name: 'Fluxo do dinheiro' })).getByRole('button', { name: /^Moradia/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'A pagar' }).getAttribute('aria-pressed')).toBe('true')
    const detail = screen.getByRole('group', { name: 'Contas de Moradia' })
    const link = within(detail).getAllByRole('link')[0]
    expect(link.getAttribute('href')).toBe('/contas/b2')
    expect(flat(detail.textContent)).toContain('Aluguel')
    expect(flat(detail.textContent)).toContain('R$ 1.000,00')
    fireEvent.click(within(detail).getByRole('button', { name: 'Ver todas as categorias' }))
    expect(screen.queryByRole('group', { name: 'Contas de Moradia' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Fluxo do dinheiro' })).getByRole('button', { name: /^Moradia/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('a rosquinha e a lista de categorias escolhem a mesma categoria', () => {
    renderReports()
    const cats = screen.getByRole('region', { name: 'Contas a pagar por categoria' })
    const slice = within(cats).getByRole('button', { name: /^Contas de consumo: R\$.600,00, 17% das contas a pagar/ })
    fireEvent.click(slice)
    expect(slice.getAttribute('aria-pressed')).toBe('true')
    expect(within(cats).getAllByRole('button', { pressed: true }).length).toBeGreaterThanOrEqual(2) // fatia + linha da lista
    expect(screen.getByRole('group', { name: 'Contas de Contas de consumo' })).toBeTruthy()
    fireEvent.click(slice)
    expect(screen.queryByRole('group', { name: 'Contas de Contas de consumo' })).toBeNull()
  })

  it('com o olhinho fechado, nada novo mostra valor (fluxo, mapa, acumulado, categoria)', () => {
    localStorage.setItem('contas-em-dia:ocultar-valores', '1')
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Fluxo do dinheiro' })).getByRole('button', { name: /^Moradia/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Dia 10/ }))
    expect(document.body.textContent).not.toMatch(/\d\.\d{3},\d{2}|\d+,\d{2}/)
  })

  it('mostra carregando enquanto os dados não chegam', () => {
    hooks.useEntriesRange.mockReturnValue({ data: [], ready: false, error: null })
    renderReports()
    expect(screen.getByText('Carregando…')).toBeTruthy()
  })
})

describe('Relatórios: gasto real (compra a receber ligada a uma conta)', () => {
  const ligado: Receivable = { ...tenis, billId: 'b2' } // o Tênis volta pelo Aluguel (só para o teste)

  it('sem nenhuma ligação, não mostra a escolha entre bruto e real', () => {
    renderReports()
    expect(screen.queryByRole('button', { name: 'Real' })).toBeNull()
  })

  it('o Real desconta das contas o que as pessoas devolvem e não conta duas vezes no a receber', () => {
    hooks.useReceivables.mockReturnValue(live([ligado]))
    renderReports()
    expect(screen.getByRole('button', { name: 'Bruto' }).getAttribute('aria-pressed')).toBe('true')
    expect(flat(kpi('A pagar').textContent)).toContain('R$ 3.600,00')
    expect(flat(kpi('A receber').textContent)).toContain('R$ 300,00')

    fireEvent.click(screen.getByRole('button', { name: 'Real' }))
    // 3.600 - 300 (uma parcela por mês, nos 3 meses) = 3.300; as parcelas foram descontadas, então o a receber zera
    const gasto = kpi('Gasto real')
    expect(flat(gasto.textContent)).toContain('R$ 3.300,00')
    expect(screen.getByRole('columnheader', { name: 'Gasto real' })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'A pagar' })).toBeNull()
    expect(flat(kpi('A receber').textContent)).toContain('R$ 0,00')
    // 100 já recebidos em outubro; 200 ainda não
    const note = flat(document.querySelector('.basis-row .small-note')!.textContent)
    expect(note).toContain('R$ 300,00')
    expect(note).toContain('R$ 200,00 ainda não recebidos')

    fireEvent.click(screen.getByRole('button', { name: 'Bruto' }))
    expect(flat(kpi('A pagar').textContent)).toContain('R$ 3.600,00')
  })

  it('em "A receber" a escolha some e as parcelas aparecem inteiras', () => {
    hooks.useReceivables.mockReturnValue(live([ligado]))
    renderReports()
    fireEvent.click(screen.getByRole('button', { name: 'Real' }))
    fireEvent.click(screen.getByRole('button', { name: 'A receber' }))
    expect(screen.queryByRole('button', { name: 'Real' })).toBeNull()
    expect(flat(kpi('A receber').textContent)).toContain('R$ 300,00')
  })
})

describe('Relatórios: ordenação', () => {
  const bruno: Person = { id: 'p2', name: 'Bruno Lima', phone: '', email: '', charges: [] }
  // Bruno deve R$ 500,00 numa parcela única que vence em 10/12 (não está atrasada).
  const mochila: Receivable = {
    id: 'r2',
    personId: 'p2',
    kind: 'cartao',
    description: 'Mochila',
    totalCents: 50000,
    installmentCount: 1,
    firstDueDate: '2026-12-10',
    installments: buildInstallments(50000, 1, '2026-12-10'),
    notes: '',
  }
  const debtorNames = () => Array.from(document.querySelectorAll('.debtor-name')).map((el) => (el.firstChild?.textContent ?? '').trim())
  const group = (name: string) => within(screen.getByRole('group', { name }))
  const pick = (name: string, option: string) => {
    const select = group(name).getByLabelText('Ordenar por') as HTMLSelectElement
    fireEvent.change(select, { target: { value: Array.from(select.options).find((o) => o.textContent === option)!.value } })
  }
  const monthRows = () =>
    within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1, -1)
      .map((r) => flat(r.querySelector('th,td')?.textContent ?? null).trim())

  beforeEach(() => {
    hooks.usePeople.mockReturnValue(live([ana, bruno]))
    hooks.useReceivables.mockReturnValue(live([tenis, mochila]))
  })

  it('"Quem mais deve" abre pelo maior valor em aberto e ordena por nome', () => {
    renderReports()
    expect(debtorNames()).toEqual(['Bruno Lima', 'Ana Souza'])
    const select = group('Ordenação de quem mais deve').getByLabelText('Ordenar por') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Valor em aberto', 'Nome'])
    pick('Ordenação de quem mais deve', 'Nome')
    expect(debtorNames()).toEqual(['Ana Souza', 'Bruno Lima'])
    fireEvent.click(group('Ordenação de quem mais deve').getByRole('button'))
    expect(debtorNames()).toEqual(['Bruno Lima', 'Ana Souza'])
  })

  it('com um devedor só, não há seletor em "Quem mais deve"', () => {
    hooks.usePeople.mockReturnValue(live([ana]))
    hooks.useReceivables.mockReturnValue(live([tenis]))
    renderReports()
    expect(screen.queryByRole('group', { name: 'Ordenação de quem mais deve' })).toBeNull()
  })

  it('"Detalhamento" abre mês a mês e ordena pelas colunas da tabela, com o total sempre no fim', () => {
    renderReports()
    expect(monthRows()).toEqual(['out', 'nov', 'dez*'])
    const select = group('Ordenação do detalhamento').getByLabelText('Ordenar por') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Mês', 'A pagar', 'A receber', 'Saldo'])
    pick('Ordenação do detalhamento', 'A receber')
    expect(monthRows()[0]).toBe('dez*') // dezembro: R$ 100 de Ana + R$ 500 de Bruno
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(flat(rows.at(-1)!.textContent)).toContain('Total')
    fireEvent.click(group('Ordenação do detalhamento').getByRole('button'))
    expect(monthRows().at(-1)).toBe('dez*')
  })

  it('a ordem dos relatórios fica guardada neste aparelho', () => {
    const first = renderReports()
    pick('Ordenação de quem mais deve', 'Nome')
    pick('Ordenação do detalhamento', 'A receber')
    first.unmount()
    renderReports()
    expect(debtorNames()).toEqual(['Ana Souza', 'Bruno Lima'])
    expect(monthRows()[0]).toBe('dez*')
  })
})

describe('relatório do mês', () => {
  it('abre no mês atual, com o nome do mês, e consulta só aquele mês', () => {
    renderReports('Mês')
    const group = screen.getByRole('group', { name: 'Tipo de período' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mês', 'Trimestre', 'Semestre', 'Ano'])
    expect(within(group).getByRole('button', { name: 'Mês' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { level: 2, name: 'Novembro de 2026' })).toBeTruthy()
    expect(screen.queryByText('nov a nov')).toBeNull()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-11', '2026-11')
  })

  it('anda de mês em mês, atravessando o ano', () => {
    renderReports('Mês')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo período' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Dezembro de 2026' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo período' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Janeiro de 2027' })).toBeTruthy()
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2027-01', '2027-01')
  })
})
