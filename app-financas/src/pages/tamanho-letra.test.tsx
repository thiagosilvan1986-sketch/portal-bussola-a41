// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURES } from '../components/FeatureList'
import { applyFontSize, readFontSize } from '../data/fontSize'
import { dismissWelcome } from '../data/welcome'
import { defaultRegistry } from '../domain/registry'

const hooks = vi.hoisted(() => ({
  useBills: vi.fn(() => ({ data: [], ready: true, error: null })),
  useEntries: vi.fn(() => ({ data: [], ready: true, error: null })),
  useEntriesRange: vi.fn(() => ({ data: [], ready: true, error: null })),
  usePeople: vi.fn(() => ({ data: [], ready: true, error: null })),
  useReceivables: vi.fn(() => ({ data: [], ready: true, error: null })),
  useRegistry: vi.fn(),
  useToday: vi.fn(() => '2026-11-13'),
  useAlertSettings: vi.fn(() => ({ data: { enabled: true, days: [1], hour: 8 }, ready: true, error: null })),
  usePushDevices: vi.fn(() => ({ data: [], ready: true, error: null })),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: vi.fn() }) }))
vi.mock('../data/hooks', () => hooks)
vi.mock('../data/store', () => ({}))

import { AppRoutes } from '../App'

const KEY = 'contas-em-dia:tamanho-letra'

function renderCadastros() {
  return render(
    <MemoryRouter initialEntries={['/cadastros']}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

const group = () => screen.getByRole('group', { name: 'Tamanho da letra' })

beforeEach(() => {
  window.localStorage.clear()
  dismissWelcome()
  delete document.documentElement.dataset.fontSize
  hooks.useRegistry.mockReturnValue({ data: defaultRegistry(), ready: true, error: null })
})
afterEach(cleanup)

describe('Tamanho da letra em Cadastros', () => {
  it('oferece Pequena, Média e Grande, com Média marcada por padrão (com ✓, não só pela cor)', () => {
    renderCadastros()
    expect(screen.getByRole('heading', { name: 'Tamanho da letra' })).toBeTruthy()
    const buttons = within(group()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Pequena', '✓ Média', 'Grande'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
  })

  it('ao tocar, aplica na página na hora e guarda neste aparelho', () => {
    renderCadastros()
    fireEvent.click(within(group()).getByRole('button', { name: /Grande/ }))
    expect(document.documentElement.dataset.fontSize).toBe('grande')
    expect(window.localStorage.getItem(KEY)).toBe('grande')
    expect(within(group()).getByRole('button', { name: /Grande/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group()).getByRole('button', { name: /Grande/ }).textContent).toBe('✓ Grande')
  })

  it('volta com a escolha guardada ao abrir de novo', () => {
    window.localStorage.setItem(KEY, 'pequena')
    renderCadastros()
    expect(within(group()).getByRole('button', { name: /Pequena/ }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('leitura e aplicação do tamanho', () => {
  it('valor desconhecido ou ausente vira Média', () => {
    expect(readFontSize()).toBe('media')
    window.localStorage.setItem(KEY, 'enorme')
    expect(readFontSize()).toBe('media')
  })

  it('sem armazenamento disponível, usa Média sem quebrar', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(readFontSize()).toBe('media')
    spy.mockRestore()
  })

  it('marca a página com o tamanho escolhido', () => {
    applyFontSize('pequena')
    expect(document.documentElement.dataset.fontSize).toBe('pequena')
  })
})

describe('regras do CSS', () => {
  const css = readFileSync('src/styles.css', 'utf8')

  it('Média é um pouco menor que antes, Grande é o tamanho de antes, e tudo em percentual', () => {
    expect(css).toMatch(/html \{\s*font-size: 93\.75%;/)
    expect(css).toMatch(/html\[data-font-size='pequena'\] \{\s*font-size: 87\.5%;/)
    expect(css).toMatch(/html\[data-font-size='grande'\] \{\s*font-size: 100%;/)
  })

  it('nenhum texto com tamanho fixo em px, para todo o app acompanhar a escolha', () => {
    expect(css.match(/font-size:\s*[\d.]+px/g)).toBeNull()
  })

  it('nenhum texto menor que 0,75rem', () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]))
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.75)
  })

  it('valores das contas pagas e a vencer na cor do texto; só a atrasada em vermelho', () => {
    expect(css).toMatch(/\.row-card\.status-atrasada \.row-side > strong \{\s*color: var\(--danger\);/)
    expect(css).not.toMatch(/\.row-card\.status-paga \.row-side > strong/)
    expect(css).not.toMatch(/\.row-card\.status-vence_em_breve \.row-side > strong/)
  })
})

describe('Sobre', () => {
  it('conta onde escolher o tamanho da letra', () => {
    const item = FEATURES.find((f) => f.title === 'Letra do tamanho certo')
    expect(item?.text).toMatch(/Pequena, Média ou Grande/)
    expect(item?.text).toMatch(/neste aparelho/)
  })
})
