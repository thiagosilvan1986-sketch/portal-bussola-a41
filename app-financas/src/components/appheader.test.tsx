// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacyProvider } from '../data/privacy'
import { AppHeader } from './AppHeader'

afterEach(() => {
  cleanup()
  localStorage.clear()
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
      ['Contas', '/contas'],
      ['A receber', '/receber'],
      ['Relatórios', '/relatorios'],
      ['Ajustes', '/ajustes'],
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
      ['Importar planilha', '/ajustes/planilhas'],
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
})
