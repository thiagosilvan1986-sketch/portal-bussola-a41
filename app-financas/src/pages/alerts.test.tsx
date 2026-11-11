// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURES } from '../components/FeatureList'
import { buildEntry } from '../domain/bills'
import { defaultRegistry } from '../domain/registry'
import type { Bill } from '../domain/types'
import type { AlertSettings } from '../domain/alerts'
import type { PushDevice } from '../data/store'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 15000,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  ...over,
})

const hooks = vi.hoisted(() => ({
  useAlertSettings: vi.fn(),
  usePushDevices: vi.fn(),
  useRegistry: vi.fn(),
  useEntriesRange: vi.fn(),
}))
const store = vi.hoisted(() => ({ saveAlerts: vi.fn(), savePushDevice: vi.fn(), deletePushDevice: vi.fn() }))
const push = vi.hoisted(() => ({
  fetchPushConfig: vi.fn(),
  pushSupport: vi.fn(),
  currentEndpoint: vi.fn(),
  endpointId: vi.fn(),
  notificationPermission: vi.fn(),
  subscribeThisDevice: vi.fn(),
  unsubscribeThisDevice: vi.fn(),
  sendTestPush: vi.fn(),
}))
const getIdToken = vi.hoisted(() => vi.fn())

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c', getIdToken }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => store)
vi.mock('../data/push', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/push')>()), ...push }))

import { AppRoutes } from '../App'
import { DueSoonBanner } from '../components/DueSoonBanner'

const DEFAULTS: AlertSettings = { enabled: true, days: [1], hour: 8 }
const device = (id: string, label: string): PushDevice => ({
  id,
  label,
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: 'p', auth: 'a' },
  createdAt: '2026-11-01T12:00:00.000Z',
})

function setup(opts: { settings?: AlertSettings; devices?: PushDevice[]; thisId?: string | null } = {}) {
  hooks.useAlertSettings.mockReturnValue({ data: opts.settings ?? DEFAULTS, ready: true, error: null })
  hooks.usePushDevices.mockReturnValue({ data: opts.devices ?? [], ready: true, error: null })
  hooks.useRegistry.mockReturnValue({ data: defaultRegistry(), ready: true, error: null })
  push.currentEndpoint.mockResolvedValue(opts.thisId ? `https://fcm.googleapis.com/fcm/send/${opts.thisId}` : null)
  push.endpointId.mockImplementation(async (endpoint: string) => endpoint.split('/').pop())
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
  push.pushSupport.mockReturnValue('ok')
  push.fetchPushConfig.mockResolvedValue({ status: 'ready', publicKey: 'BKey' })
  push.notificationPermission.mockReturnValue('default')
  store.saveAlerts.mockResolvedValue(undefined)
  store.savePushDevice.mockResolvedValue(undefined)
  store.deletePushDevice.mockResolvedValue(undefined)
  getIdToken.mockResolvedValue('tok-123')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Cadastros: atalho para os alertas', () => {
  it('o menu mostra o resumo do que está escolhido e leva à tela', () => {
    setup({ settings: { enabled: true, days: [1, 3], hour: 9 } })
    renderAt('/cadastros')
    const link = screen.getByRole('link', { name: /Alertas de vencimento/ })
    expect(within(link).getByText('1 e 3 dias antes · às 09h')).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/cadastros/alertas')
  })

  it('desligado, o menu diz isso', () => {
    setup({ settings: { enabled: false, days: [1], hour: 8 } })
    renderAt('/cadastros')
    expect(within(screen.getByRole('link', { name: /Alertas de vencimento/ })).getByText('Avisos desligados')).toBeTruthy()
  })
})

describe('Tela Alertas de vencimento: quando avisar', () => {
  it('começa com o padrão: ligado, 1 dia antes, às 8h', () => {
    renderAt('/cadastros/alertas')
    expect((screen.getByRole('checkbox', { name: /Avisar antes de a conta vencer/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: '1 dia' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '3 dias' }).getAttribute('aria-pressed')).toBe('false')
    expect((screen.getByLabelText(/Horário do aviso/) as HTMLSelectElement).value).toBe('8')
  })

  it('oferece todos os prazos, com texto em cada botão', () => {
    renderAt('/cadastros/alertas')
    const group = screen.getByRole('group', { name: 'Quantos dias antes' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'No dia',
      '1 dia',
      '2 dias',
      '3 dias',
      '5 dias',
      '7 dias',
      '10 dias',
      '15 dias',
    ])
  })

  it('marcar mais um prazo grava na hora', () => {
    renderAt('/cadastros/alertas')
    fireEvent.click(screen.getByRole('button', { name: '3 dias' }))
    expect(store.saveAlerts).toHaveBeenCalledWith('u1', { enabled: true, days: [1, 3], hour: 8 })
  })

  it('desmarcar um prazo grava na hora', () => {
    setup({ settings: { enabled: true, days: [0, 1], hour: 8 } })
    renderAt('/cadastros/alertas')
    fireEvent.click(screen.getByRole('button', { name: 'No dia' }))
    expect(store.saveAlerts).toHaveBeenCalledWith('u1', { enabled: true, days: [1], hour: 8 })
  })

  it('não deixa desmarcar o último prazo e explica', () => {
    renderAt('/cadastros/alertas')
    fireEvent.click(screen.getByRole('button', { name: '1 dia' }))
    expect(store.saveAlerts).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/pelo menos um prazo/)
  })

  it('troca o horário', () => {
    renderAt('/cadastros/alertas')
    fireEvent.change(screen.getByLabelText(/Horário do aviso/), { target: { value: '20' } })
    expect(store.saveAlerts).toHaveBeenCalledWith('u1', { enabled: true, days: [1], hour: 20 })
  })

  it('desligar a chave grava e trava os prazos e o horário', () => {
    renderAt('/cadastros/alertas')
    fireEvent.click(screen.getByRole('checkbox', { name: /Avisar antes de a conta vencer/ }))
    expect(store.saveAlerts).toHaveBeenCalledWith('u1', { enabled: false, days: [1], hour: 8 })
  })

  it('desligado, os prazos e o horário ficam desabilitados', () => {
    setup({ settings: { enabled: false, days: [1], hour: 8 } })
    renderAt('/cadastros/alertas')
    expect((screen.getByRole('button', { name: '3 dias' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText(/Horário do aviso/) as HTMLSelectElement).disabled).toBe(true)
  })

  it('falha ao gravar mostra o erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    store.saveAlerts.mockRejectedValue(new Error('sem permissão'))
    renderAt('/cadastros/alertas')
    fireEvent.click(screen.getByRole('button', { name: '3 dias' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível salvar/))
  })
})

describe('Tela Alertas de vencimento: este aparelho', () => {
  it('servidor não configurado: explica e não oferece o botão', async () => {
    push.fetchPushConfig.mockResolvedValue({ status: 'unavailable' })
    renderAt('/cadastros/alertas')
    await screen.findByText(/ainda não foi ligado neste site/)
    expect(screen.queryByRole('button', { name: 'Ativar neste aparelho' })).toBeNull()
  })

  it('iPhone sem o app instalado: ensina a instalar', () => {
    push.pushSupport.mockReturnValue('install-first')
    renderAt('/cadastros/alertas')
    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ativar neste aparelho' })).toBeNull()
  })

  it('navegador sem suporte: explica', () => {
    push.pushSupport.mockReturnValue('unsupported')
    renderAt('/cadastros/alertas')
    expect(screen.getByText(/não recebe avisos com o app fechado/)).toBeTruthy()
  })

  it('notificações bloqueadas: explica como liberar', async () => {
    push.notificationPermission.mockReturnValue('denied')
    renderAt('/cadastros/alertas')
    await screen.findByText(/estão bloqueadas para este site/)
    expect(screen.queryByRole('button', { name: 'Ativar neste aparelho' })).toBeNull()
  })

  it('ativar: pede permissão, inscreve o aparelho e grava', async () => {
    push.subscribeThisDevice.mockResolvedValue({
      id: 'abc',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
      label: 'Android · Chrome',
    })
    renderAt('/cadastros/alertas')
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }))
    await waitFor(() => expect(store.savePushDevice).toHaveBeenCalled())
    expect(push.subscribeThisDevice).toHaveBeenCalledWith('BKey')
    const saved = store.savePushDevice.mock.calls[0]
    expect(saved[0]).toBe('u1')
    expect(saved[1]).toMatchObject({ id: 'abc', label: 'Android · Chrome', endpoint: 'https://fcm.googleapis.com/fcm/send/abc' })
    expect(typeof saved[1].createdAt).toBe('string')
    expect((await screen.findByRole('status')).textContent).toMatch(/Este aparelho vai receber os avisos/)
  })

  it('permissão negada ao ativar mostra a mensagem do aparelho', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { PushError } = await import('../data/push')
    push.subscribeThisDevice.mockRejectedValue(new PushError('As notificações estão bloqueadas para este site.', 'denied'))
    renderAt('/cadastros/alertas')
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/bloqueadas para este site/))
    expect(store.savePushDevice).not.toHaveBeenCalled()
  })

  it('aparelho já ativo: mostra o estado e os botões de teste e desativar', async () => {
    setup({ devices: [device('abc', 'Android · Chrome')], thisId: 'abc' })
    renderAt('/cadastros/alertas')
    await screen.findByText(/Avisos ativos neste aparelho/)
    expect(screen.getByRole('button', { name: 'Enviar aviso de teste' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Desativar neste aparelho' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ativar neste aparelho' })).toBeNull()
  })

  it('aviso de teste usa o token de quem está logado e diz quantos aparelhos receberam', async () => {
    setup({ devices: [device('abc', 'Android · Chrome')], thisId: 'abc' })
    push.sendTestPush.mockResolvedValue({ sent: 1, total: 1 })
    renderAt('/cadastros/alertas')
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }))
    await waitFor(() => expect(push.sendTestPush).toHaveBeenCalledWith('tok-123'))
    expect((await screen.findByRole('status')).textContent).toMatch(/Aviso enviado para 1 aparelho/)
  })

  it('teste que não chegou a ninguém sugere reativar', async () => {
    setup({ devices: [device('abc', 'Android · Chrome')], thisId: 'abc' })
    push.sendTestPush.mockResolvedValue({ sent: 0, total: 1 })
    renderAt('/cadastros/alertas')
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/não chegou a nenhum aparelho/)
  })

  it('desativar cancela a inscrição e apaga o cadastro do aparelho', async () => {
    setup({ devices: [device('abc', 'Android · Chrome')], thisId: 'abc' })
    push.unsubscribeThisDevice.mockResolvedValue('abc')
    renderAt('/cadastros/alertas')
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar neste aparelho' }))
    await waitFor(() => expect(store.deletePushDevice).toHaveBeenCalledWith('u1', 'abc'))
    expect((await screen.findByRole('status')).textContent).toMatch(/desativados neste aparelho/)
  })
})

describe('Tela Alertas de vencimento: outros aparelhos', () => {
  it('lista os outros aparelhos e remove só depois de confirmar', async () => {
    setup({ devices: [device('abc', 'Android · Chrome'), device('xyz', 'Windows · Edge')], thisId: 'abc' })
    renderAt('/cadastros/alertas')
    const section = await screen.findByRole('region', { name: 'Outros aparelhos' })
    expect(within(section).getByText('Windows · Edge')).toBeTruthy()
    expect(within(section).queryByText('Android · Chrome')).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: 'Remover Windows · Edge' }))
    expect(store.deletePushDevice).not.toHaveBeenCalled()
    fireEvent.click(within(section).getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(store.deletePushDevice).toHaveBeenCalledWith('u1', 'xyz'))
  })

  it('sem outros aparelhos, a lista não aparece', () => {
    renderAt('/cadastros/alertas')
    expect(screen.queryByRole('region', { name: 'Outros aparelhos' })).toBeNull()
  })
})

describe('Faixa "Vence amanhã" no Início', () => {
  const TODAY = '2026-11-09'
  const mount = (bills: Bill[], entries = [] as ReturnType<typeof buildEntry>[]) => {
    hooks.useEntriesRange.mockReturnValue({ data: entries, ready: true, error: null })
    return render(<DueSoonBanner uid="u1" today={TODAY} bills={bills} />)
  }

  it('avisa a conta que vence amanhã', () => {
    mount([bill()])
    expect(screen.getByRole('status').textContent).toBe('Vence amanhã: Energia')
  })

  it('segue os prazos escolhidos: uma frase por prazo', () => {
    setup({ settings: { enabled: true, days: [1, 3], hour: 8 } })
    mount([bill({ id: 'a', name: 'Energia', dueDay: 10 }), bill({ id: 'b', name: 'Internet', dueDay: 12 })])
    expect(screen.getAllByRole('status').map((p) => p.textContent)).toEqual(['Vence amanhã: Energia', 'Vence em 3 dias: Internet'])
  })

  it('quem vence hoje não entra aqui (já tem a faixa "Vence hoje")', () => {
    setup({ settings: { enabled: true, days: [0], hour: 8 } })
    mount([bill({ dueDay: 9 })])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('conta já paga não aparece', () => {
    const b = bill()
    mount([b], [{ ...buildEntry(b, '2026-11'), paidAt: '2026-11-08', paidAmountCents: 15000 }])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('avisos desligados: sem faixa', () => {
    setup({ settings: { enabled: false, days: [1], hour: 8 } })
    mount([bill()])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('espera os lançamentos carregarem, para não avisar de conta já paga', () => {
    hooks.useEntriesRange.mockReturnValue({ data: [], ready: false, error: null })
    render(<DueSoonBanner uid="u1" today={TODAY} bills={[bill()]} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('nada vence amanhã: sem faixa', () => {
    mount([bill({ dueDay: 25 })])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('na virada do mês, olha os lançamentos dos dois meses', () => {
    setup()
    hooks.useEntriesRange.mockReturnValue({ data: [], ready: true, error: null })
    render(<DueSoonBanner uid="u1" today="2026-11-30" bills={[bill({ dueDay: 1 })]} />)
    expect(hooks.useEntriesRange).toHaveBeenLastCalledWith('u1', '2026-11', '2026-12')
    expect(screen.getByRole('status').textContent).toBe('Vence amanhã: Energia')
  })
})

describe('Sobre', () => {
  it('lista o aviso antes de vencer', () => {
    const item = FEATURES.find((f) => f.title === 'Aviso antes de vencer')
    expect(item).toBeTruthy()
    expect(item!.text).toMatch(/celular e no navegador/)
  })
})
