// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivacyProvider } from '../data/privacy'
const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../auth', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c' }, signOut: auth.signOut }) }))

import { AppHeader } from './AppHeader'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('Cabeçalho do app', () => {
  it('mostra o logo e leva para o início', () => {
    render(
      <MemoryRouter initialEntries={['/contas']}>
        <AppHeader />
      </MemoryRouter>,
    )
    expect(screen.getByAltText('Contas em Dia').getAttribute('src')).toBe('/logo-horizontal.webp')
    expect(screen.getByRole('link', { name: /ir para o início/i }).getAttribute('href')).toBe('/')
  })

  it('traz o menu principal junto do logo, no topo, com a tela atual marcada', () => {
    render(
      <MemoryRouter initialEntries={['/receber/pessoa/p1']}>
        <AppHeader />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Início', '/'],
      ['A pagar', '/contas'],
      ['A receber', '/receber'],
      ['Relatórios', '/relatorios'],
      ['Cadastros', '/cadastros'],
      ['Sobre', '/sobre'],
    ])
    expect(within(nav).getByRole('link', { name: 'A receber' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Início' }).getAttribute('aria-current')).toBeNull()
    // o menu fica dentro do cabeçalho do topo
    expect(document.querySelector('header.app-header nav.main-nav')).toBeTruthy()
  })

  it('o olhinho alterna entre ocultar e mostrar os valores, e lembra a escolha no aparelho', () => {
    render(
      <MemoryRouter>
        <PrivacyProvider>
          <AppHeader />
        </PrivacyProvider>
      </MemoryRouter>,
    )
    const eye = screen.getByRole('button', { name: 'Ocultar valores' })
    expect(eye.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(eye)
    expect(screen.getByRole('button', { name: 'Mostrar valores' }).getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('contas-em-dia:ocultar-valores')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar valores' }))
    expect(localStorage.getItem('contas-em-dia:ocultar-valores')).toBeNull()
  })

  it('abre já com os valores ocultos se foi a última escolha', () => {
    localStorage.setItem('contas-em-dia:ocultar-valores', '1')
    render(
      <MemoryRouter>
        <PrivacyProvider>
          <AppHeader />
        </PrivacyProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toBeTruthy()
  })

  it('o botão Incluir oferece conta a pagar e valor a receber, nesta ordem fora de "A receber"', () => {
    render(
      <MemoryRouter initialEntries={['/contas']}>
        <AppHeader />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Incluir/ }))
    const dialog = screen.getByRole('dialog', { name: 'Incluir' })
    const links = within(dialog).getAllByRole('link')
    expect(links.map((a) => [a.querySelector('strong')?.textContent, a.getAttribute('href')])).toEqual([
      ['Conta a pagar', '/contas/nova'],
      ['Valor a receber', '/receber/nova'],
      ['Importar planilha', '/cadastros/planilhas'],
    ])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('na área "A receber", o primeiro item do Incluir é o valor a receber', () => {
    render(
      <MemoryRouter initialEntries={['/receber/pessoa/p1']}>
        <AppHeader />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Incluir/ }))
    expect(within(screen.getByRole('dialog')).getAllByRole('link')[0].getAttribute('href')).toBe('/receber/nova')
  })

  it('escolher uma opção fecha a folha e a tecla Esc também', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Incluir/ }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Incluir/ }))
    fireEvent.click(screen.getByRole('link', { name: /Conta a pagar/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('o olhinho mostra olho aberto com os valores à vista e olho fechado com os valores ocultos, sempre com texto', () => {
    render(
      <MemoryRouter>
        <PrivacyProvider>
          <AppHeader />
        </PrivacyProvider>
      </MemoryRouter>,
    )
    const open = screen.getByRole('button', { name: 'Ocultar valores' })
    expect(open.textContent).toBe('Ocultar')
    // olho aberto: uma pupila (círculo) e nenhum traço de pálpebra fechada
    expect(open.querySelector('circle')).toBeTruthy()
    expect(open.querySelectorAll('path')).toHaveLength(1)

    fireEvent.click(open)
    const closed = screen.getByRole('button', { name: 'Mostrar valores' })
    expect(closed.textContent).toBe('Mostrar')
    // olho fechado: sem pupila; a pálpebra e três cílios, e nenhum risco por cima
    expect(closed.querySelector('circle')).toBeNull()
    expect(closed.querySelectorAll('path')).toHaveLength(4)
  })

  it('tem o botão de desligar, com o texto Sair, ao lado do Incluir; ele encerra a sessão', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )
    const actions = document.querySelector('.header-actions')!
    const labels = within(actions as HTMLElement)
      .getAllByRole('button')
      .map((b) => b.textContent?.replace(/＋\s*/, '').trim())
    expect(labels).toEqual(['Ocultar', 'Incluir', 'Sair'])
    fireEvent.click(screen.getByRole('button', { name: 'Sair do app' }))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('só o Sair é vermelho no cabeçalho (classe header-exit), com ícone e texto', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )
    const exit = screen.getByRole('button', { name: 'Sair do app' })
    expect(exit.classList.contains('header-exit')).toBe(true)
    expect(exit.textContent).toBe('Sair')
    expect(exit.querySelector('svg')).toBeTruthy()
    const others = document.querySelectorAll('.header-actions button:not(.header-exit)')
    expect(others.length).toBeGreaterThan(0)
    others.forEach((b) => expect(b.classList.contains('header-exit')).toBe(false))
  })

  it('a logo leva sempre ao Início, de qualquer tela', () => {
    render(
      <MemoryRouter initialEntries={['/cadastros/atalhos/novo']}>
        <AppHeader />
      </MemoryRouter>,
    )
    const logo = screen.getByRole('link', { name: /ir para o início/i })
    expect(logo.getAttribute('href')).toBe('/')
    expect(logo.querySelector('img')).toBeTruthy()
  })
})
